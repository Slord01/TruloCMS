const { EventEmitter } = require('node:events');
const { openStore } = require('../store.cjs');
const { openPostgresStore } = require('../postgres-store.cjs');

async function openTestStore() {
  if (process.env.CMS_TEST_DATABASE !== 'postgres') return openStore(':memory:');
  // PGlite runs PostgreSQL itself in WebAssembly. This validates the same SQL
  // and migrations without requiring a local Docker daemon or cloud credentials.
  const { PGlite } = require('@electric-sql/pglite');
  const postgres = new PGlite();
  class TestPool extends EventEmitter {
    async query(sql, values) {
      if (sql.includes('CREATE TABLE IF NOT EXISTS secrets')) {
        const results = await postgres.exec(sql);
        return results.at(-1);
      }
      const result = await postgres.query(sql, values);
      return { ...result, rowCount: result.affectedRows ?? result.rows.length };
    }
    async connect() { return { query: this.query.bind(this), release() {} }; }
    async end() { await postgres.close(); }
  }
  return openPostgresStore({ connectionString: 'postgresql://test@127.0.0.1/test', Pool: TestPool });
}
module.exports = { openTestStore };
