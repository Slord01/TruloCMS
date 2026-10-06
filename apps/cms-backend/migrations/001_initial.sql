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
