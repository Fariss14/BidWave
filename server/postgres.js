import { databaseTlsOptions } from './databaseTls.js';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
import { createObjectStorage } from './objectStorage.js';
pg.types.setTypeParser(20, (value) => Number(value));
// Application SQL is parameterized; this bridge handles the small SQLite syntax differences.
export function postgresSql(sql) {
  let index = 0;
  const ignore = /^INSERT OR IGNORE /i.test(sql);
  let result = sql.replace(/^INSERT OR IGNORE /i, 'INSERT ').replace(/\?/g, () => `$${++index}`);
  if (ignore) result += ' ON CONFLICT DO NOTHING';
  return result;
}
export async function openPostgres(env = process.env) {
  const url = new URL(env.DATABASE_URL);
  // Enforce certificate verification, including when a copied URI specifies sslmode=require.
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  const pool = new pg.Pool({ connectionString: url.toString(), max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, ssl: databaseTlsOptions(env.DATABASE_CA_CERT) });
  pool.on('error', () => console.error('Database connection interrupted.'));
  const storage = createObjectStorage(env);
  const db = createPostgresAdapter(pool, storage);
  try {
    const schema = await readFile(new URL('./migrations/postgres.sql', import.meta.url), 'utf8');
    console.info(env.DATABASE_CA_CERT?.trim() ? 'Database TLS: custom CA certificate loaded; verification enabled.' : 'Database TLS: using system certificates; DATABASE_CA_CERT is not configured.');
    await pool.query(schema);
    await storage.check();
    return db;
  } catch (error) { await pool.end(); if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN') throw new Error('Database certificate verification failed. Set DATABASE_CA_CERT in Render to the complete CA certificate downloaded from this Supabase project, then save and redeploy. If already set, verify the value is certificate text and belongs to this project.', { cause: error }); throw error; }
}

export function createPostgresAdapter(pool, storage) {
  const context = new AsyncLocalStorage();
  async function query(sql, params) {
    const state = context.getStore();
    const uploaded = [];
    try {
      const values = [];
      for (const value of params) {
        if (Buffer.isBuffer(value) || value instanceof Uint8Array) { const reference = await storage.put(Buffer.from(value)); uploaded.push(reference); values.push(reference); }
        else values.push(value);
      }
      const client = state?.client || await pool.connect();
      let result;
      try {
        if (!state) await client.query('SET search_path TO bidwave');
        result = await client.query(postgresSql(sql), values);
      } finally { if (!state) client.release(); }
      state?.uploads.push(...uploaded);
      for (const row of result.rows) for (const field of ['bytes','proof']) if (row[field]) row[field] = await storage.get(row[field]);
      return result;
    } catch (error) { await Promise.allSettled(uploaded.map((reference) => storage.remove(reference))); throw error; }
  }
  const db = {
    prepare(sql) { return {
      async get(...params) { return (await query(sql, params)).rows[0]; },
      async all(...params) { return (await query(sql, params)).rows; },
      async run(...params) { return { changes: (await query(sql, params)).rowCount }; },
    }; },
    async transaction(action) {
      if (context.getStore()) return action();
      const client = await pool.connect(); const state = { client, uploads: [] };
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL search_path TO bidwave');
        // Serialize state transitions across requests/instances, preserving atomic auction results.
        await client.query('SELECT pg_advisory_xact_lock(72461931)');
        const value = await context.run(state, action);
        await client.query('COMMIT'); return value;
      } catch (error) { await client.query('ROLLBACK'); await Promise.allSettled(state.uploads.map((reference) => storage.remove(reference))); throw error; }
      finally { client.release(); }
    },
    async close() { await pool.end(); },
  };
  return db;
}
