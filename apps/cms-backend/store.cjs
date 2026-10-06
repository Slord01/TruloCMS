const { mkdirSync } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function openStore(filename) {
  if (filename === undefined && process.env.DATABASE_URL) {
    return require('./postgres-store.cjs').openPostgresStore();
  }
  if (filename === undefined && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
    throw new Error('DATABASE_URL is required in production; local SQLite fallback is disabled.');
  }
  filename ||= process.env.CMS_DATABASE_PATH || path.join(__dirname, 'data', 'trulo.sqlite');
  const { DatabaseSync } = require('node:sqlite');
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'superuser' CHECK(role = 'superuser'), created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sales_channels (
      id TEXT PRIMARY KEY, domain TEXT UNIQUE NOT NULL, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_settings (
      channel_id TEXT PRIMARY KEY REFERENCES sales_channels(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_documents (
      channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(channel_id, kind)
    );
    CREATE TABLE IF NOT EXISTS content (
      id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES sales_channels(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS content_scope ON content(channel_id, kind);
  `);
  db.prepare('INSERT OR IGNORE INTO secrets VALUES (?, ?)').run('jwt', crypto.randomBytes(48).toString('hex'));
  return db;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function checkPassword(password, hash) {
  const [salt, expected] = hash.split(':');
  const actual = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}
async function createSuperuser(db, email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid email required.');
  if (typeof password !== 'string' || password.length < 12) throw new Error('Password must contain at least 12 characters.');
  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(id, email, hashPassword(password), 'superuser', new Date().toISOString());
  return id;
}
module.exports = { openStore, hashPassword, checkPassword, createSuperuser };
