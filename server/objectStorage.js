import { randomUUID } from 'node:crypto';
const prefix = 'bidwave-object:v1:';
export function createObjectStorage(env, request = fetch) {
  const origin = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !key || new URL(origin).protocol !== 'https:') throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY for persistent uploads.');
  const base = `${origin.replace(/\/$/, '')}/storage/v1`;
  const bucket = env.SUPABASE_STORAGE_BUCKET || 'bidwave-private';
  if (!/^[a-z0-9-]+$/.test(bucket)) throw new Error('Invalid storage bucket name.');
  const headers = { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}) };
  async function call(path, options = {}) {
    const response = await request(base + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Persistent file storage request failed (${response.status}).`);
    return response;
  }
  return {
    async check() { const response = await call(`/bucket/${bucket}`); const info = await response.json(); if (info.public) throw new Error('The BidWave storage bucket must be private.'); },
    async put(bytes) { const path = randomUUID(); await call(`/object/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }); return Buffer.from(prefix + path); },
    async get(bytes) { if (!Buffer.isBuffer(bytes) || !bytes.toString().startsWith(prefix)) return bytes; const path = bytes.toString().slice(prefix.length); if (!/^[a-f0-9-]+$/.test(path)) throw new Error('Invalid stored file reference.'); return Buffer.from(await (await call(`/object/authenticated/${bucket}/${path}`)).arrayBuffer()); },
    async remove(reference) { const path = reference.toString().slice(prefix.length); await call(`/object/${bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) }); },
  };
}
