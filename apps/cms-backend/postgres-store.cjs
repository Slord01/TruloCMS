const { readFileSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function poolConfiguration(value = process.env.DATABASE_URL) {
  if (!value) throw new Error('DATABASE_URL is required.');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!loopback && url.searchParams.get('sslmode') === 'disable') throw new Error('Remote PostgreSQL requires TLS.');
  // pg's connection-string SSL options overwrite its ssl object. Keep certificate
  // verification explicit; Render external certificates use public trust roots.
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  const max = Number(process.env.CMS_DATABASE_POOL_MAX || 2);
  if (!Number.isInteger(max) || max < 1 || max > 10) throw new Error('CMS_DATABASE_POOL_MAX must be between 1 and 10.');
  return {
    connectionString: url.href,
    ssl: loopback ? false : { rejectUnauthorized: true },
    max, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000,
    statement_timeout: 10000, query_timeout: 15000,
    application_name: 'trulo-cms', allowExitOnIdle: true,
  };
}

function parameterizedSql(sql) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? `$${++index}` : token);
}

function postgresAdapter(pool) {
  return {
    dialect: 'postgres',
    prepare(sql) {
      const text = parameterizedSql(sql);
      return {
        async get(...values) { return (await pool.query(text, values)).rows[0]; },
        async all(...values) { return (await pool.query(text, values)).rows; },
        async run(...values) { return { changes: (await pool.query(text, values)).rowCount }; },
      };
    },
    async close() { await pool.end(); },
  };
}

async function openPostgresStore({ connectionString = process.env.DATABASE_URL, Pool = require('pg').Pool } = {}) {
  const pool = new Pool(poolConfiguration(connectionString));
  pool.on('error', () => console.error('CMS PostgreSQL idle connection failed.'));
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // Transaction-scoped lock protects migrations across simultaneous cold starts.
    await client.query('SELECT pg_advisory_xact_lock(746785301)');
    await client.query('CREATE TABLE IF NOT EXISTS cms_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    if (!(await client.query('SELECT version FROM cms_migrations WHERE version = 1')).rows.length) {
      await client.query(readFileSync(path.join(__dirname, 'migrations', '001_initial.sql'), 'utf8'));
      await client.query('INSERT INTO cms_migrations(version) VALUES (1)');
    }
    // A single durable key keeps sessions valid across instances and deployments.
    await client.query('INSERT INTO secrets(key, value) VALUES ($1, $2) ON CONFLICT(key) DO NOTHING', ['jwt', crypto.randomBytes(48).toString('hex')]);
    await client.query('COMMIT');
    return postgresAdapter(pool);
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    if (client) client.release();
    client = null;
    await pool.end();
    throw error;
  } finally { if (client) client.release(); }
}
module.exports = { openPostgresStore, postgresAdapter, parameterizedSql, poolConfiguration };
