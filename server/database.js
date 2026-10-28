import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSeed } from '../src/data/seed.js';

export function openDatabase(path = 'data/bidwave.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS auctions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS addresses (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      auction_id TEXT UNIQUE, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS order_user ON orders(user_id);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL REFERENCES orders(id),
      user_id TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL,
      proof BLOB NOT NULL, mime TEXT NOT NULL, filename TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS refund_proofs (order_id TEXT PRIMARY KEY REFERENCES orders(id), proof BLOB NOT NULL, mime TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payment_history AS SELECT * FROM payments WHERE 0;
    CREATE INDEX IF NOT EXISTS payment_user ON payments(user_id);
    CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, normalized TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, bytes BLOB NOT NULL, mime TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS seller_settings (user_id TEXT PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS finalized_auctions (auction_id TEXT PRIMARY KEY REFERENCES auctions(id), finalized_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), auction_id TEXT NOT NULL,
      type TEXT NOT NULL, data TEXT NOT NULL, read_at INTEGER,
      UNIQUE(user_id, auction_id, type)
    );
    CREATE INDEX IF NOT EXISTS notification_user ON notifications(user_id);

  `);
  if (!db.prepare('SELECT id FROM auctions LIMIT 1').get()) {
    const insert = db.prepare('INSERT INTO auctions (id, data) VALUES (?, ?)');
    for (const auction of createSeed().auctions) insert.run(auction.id, JSON.stringify(auction));
  }
  return db;
}

export function transaction(db, action) {
  db.exec('BEGIN IMMEDIATE');
  try { const value = action(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

// Serialize SQLite transactions now that request handlers also support async databases.
const queues = new WeakMap();
export async function asyncTransaction(db, action) {
  if (db.transaction) return db.transaction(action);
  const previous = queues.get(db) || Promise.resolve();
  const result = previous.then(async () => {
    db.exec('BEGIN IMMEDIATE');
    try { const value = await action(); db.exec('COMMIT'); return value; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  });
  queues.set(db, result.catch(() => {}));
  return result;
}
