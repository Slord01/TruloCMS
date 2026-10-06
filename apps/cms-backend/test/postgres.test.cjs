const { test } = require('node:test');
const assert = require('node:assert/strict');
const { poolConfiguration, parameterizedSql, openPostgresStore } = require('../postgres-store.cjs');
const { openStore } = require('../store.cjs');

test('remote PostgreSQL uses verified TLS and bounded pools; credentials never become browser variables', () => {
  const config = poolConfiguration('postgresql://test@database.example/test?sslmode=require');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
  assert(config.max <= 10);
  assert.throws(() => poolConfiguration('postgresql://test@database.example/test?sslmode=disable'), /requires TLS/);
  assert.throws(() => poolConfiguration('https://database.example'), /PostgreSQL/);
  assert.equal(poolConfiguration('postgresql://test@127.0.0.1/test').ssl, false);
  assert.equal(parameterizedSql("SELECT '?' AS marker FROM content WHERE id = ? AND kind = ?"), "SELECT '?' AS marker FROM content WHERE id = $1 AND kind = $2");
});

test('PostgreSQL migrations are repeatable and sessions share a durable signing key across instances', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const { EventEmitter } = require('node:events');
  const postgres = new PGlite();
  class Pool extends EventEmitter {
    async query(sql, values) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS secrets')) return (await postgres.exec(sql)).at(-1);
      const result = await postgres.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }
    async connect() { return { query: this.query.bind(this), release() {} }; }
    async end() {}
  }
  try {
    const one = await openPostgresStore({ connectionString: 'postgresql://test@127.0.0.1/test', Pool });
    const secretOne = (await one.prepare('SELECT value FROM secrets WHERE key = ?').get('jwt')).value;
    const two = await openPostgresStore({ connectionString: 'postgresql://test@127.0.0.1/test', Pool });
    assert.equal((await two.prepare('SELECT value FROM secrets WHERE key = ?').get('jwt')).value, secretOne);
    assert.equal((await two.prepare('SELECT * FROM cms_migrations').all()).length, 1);
    const { signToken, readToken } = require('../server.cjs');
    assert.equal(readToken(signToken({ id: 'shared-user' }, secretOne), (await two.prepare('SELECT value FROM secrets WHERE key = ?').get('jwt')).value).id, 'shared-user');
    await one.close(); await two.close();
  } finally { await postgres.close(); }
});

test('production cannot silently create an ephemeral SQLite database', async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousNode = process.env.NODE_ENV;
  try {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'production';
    await assert.rejects(openStore(), /DATABASE_URL is required/);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    if (previousNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNode;
  }
});
