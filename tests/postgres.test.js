import { databaseTlsOptions } from '../server/databaseTls.js';
import { rootCertificates } from 'node:tls';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { createPostgresAdapter, postgresSql } from '../server/postgres.js';
import { createObjectStorage } from '../server/objectStorage.js';
import { createApp } from '../server/app.js';

test('PostgreSQL schema and API retain accounts, auctions, proofs and order decisions', async () => {
  const engine = new PGlite();
  const files = new Map();
  const storage = {
    async put(bytes) { const key = randomUUID(); files.set(key, bytes); return Buffer.from(`test-file:${key}`); },
    async get(ref) { return files.get(ref.toString().replace('test-file:', '')); },
    async remove(ref) { files.delete(ref.toString().replace('test-file:', '')); },
  };
  const client = { async query(sql, params) { return engine.query(sql, params); }, release() {} };
  const pool = { ...client, async connect() { return client; }, async end() { await engine.close(); } };
  const db = createPostgresAdapter(pool, storage);
  try {
    await engine.exec(await readFile(new URL('../server/migrations/postgres.sql', import.meta.url), 'utf8'));
    let now = Date.now();
    const app = createApp({ db, now: () => now, env: {} }); await app.ready;
    function user(name) {
      let cookie;
      return async (path, method = 'GET', body) => {
        const form = body instanceof FormData;
        const response = await app.handle(new Request(`http://test/api${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'x-bidwave-request': '1', origin: 'http://test', ...(!form && body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) }), { ip: name });
        if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.arrayBuffer() };
      };
    }
    const seller = user('seller'), buyer = user('buyer'), stranger = user('stranger');
    for (const [request,name] of [[seller,'seller'],[buyer,'buyer'],[stranger,'stranger']]) assert.equal((await request('/auth/signup','POST',{ name, email: `${name}@example.com`, password: 'password-for-tests' })).status,201);
    assert.equal((await seller('/account/seller','PUT',{ contactName:'Seller',phone:'09170000000',methods:[{id:'gcash',accountName:'Seller',accountNumber:'09170000000'}] })).status,200);
    const metadata = { title:'Postgres item',description:'A test item',category:'electronics',startingPrice:100,increment:0,duration:1,location:{mode:'manual',city:'Manila',region:'NCR',barangay:'Test'} };
    const bytes = new Uint8Array([137,80,78,71,13,10,26,10,0]);
    const form = new FormData(); form.set('metadata',JSON.stringify(metadata)); form.set('image',new Blob([bytes],{type:'image/png'}),'item.png');
    const created = await seller('/auctions','POST',form); assert.equal(created.status,201, JSON.stringify(created.data)); const a=created.data.auction;
    assert.equal(files.size,1);
    assert.equal((await stranger(a.image.replace('/api',''))).status,200);
    assert.equal((await buyer(`/auctions/${a.id}/bids`,'POST',{amount:100})).status,201);
    now=a.endsAt; await app.finalize();
    assert.equal((await buyer('/account/address','PUT',{mode:'manual',recipient:'Buyer',phone:'09170000001',street:'Test street',city:'Manila',region:'NCR',barangay:'Test',postalCode:'1000'})).status,200);
    const order=(await buyer('/account/orders')).data.orders[0]; assert.ok(order);
    function proof() { const f=new FormData();f.set('method','gcash');f.set('reference','REFERENCE');f.set('proof',new Blob([bytes],{type:'image/png'}),'proof.png');return f; }
    const payment=await buyer(`/account/orders/${order.id}/proof`,'POST',proof());assert.equal(payment.status,201,JSON.stringify(payment.data));
    const p=payment.data.payment;
    assert.equal((await stranger(`/account/payments/${p.id}/proof`)).status,404);
    assert.equal((await seller(`/account/payments/${p.id}/proof`)).status,200);
    assert.equal((await seller(`/account/sales/${order.id}/payment`,'PATCH',{paymentId:p.id,decision:'rejected',rejectionReason:'Try again'})).status,200);
    const replacement=await buyer(`/account/orders/${order.id}/proof`,'POST',proof()); assert.equal(replacement.status,201,JSON.stringify(replacement.data));
    assert.equal((await seller(`/account/payments/${p.id}/proof`)).status,200);
    assert.equal((await seller(`/account/sales/${order.id}/payment`,'PATCH',{paymentId:replacement.data.payment.id,decision:'confirmed'})).status,200);
    assert.equal((await seller(`/account/orders/${order.id}/fulfillment`,'PATCH',{action:'ship',carrier:'Courier',trackingNumber:'TEST123'})).status,200);
    assert.equal((await buyer(`/account/orders/${order.id}/fulfillment`,'PATCH',{action:'complete'})).status,200);
    const restarted = createApp({db,now:()=>now,env:{}});await restarted.ready;
    const saved=JSON.parse((await db.prepare('SELECT data FROM orders WHERE id = ?').get(order.id)).data);assert.equal(saved.fulfillment.status,'completed');
    const count=files.size;
    await assert.rejects(db.transaction(async()=> { await db.prepare('INSERT INTO media VALUES (?, ?, ?, ?, ?)').run('rollback','missing-user','product',Buffer.from(bytes),'image/png'); }));
    assert.equal(files.size,count);
  } finally { await db.close(); }
});

test('storage uses private authenticated objects and server-only keys', async () => {
  const calls=[];let bytes;
  const store=createObjectStorage({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'},async(url, options)=> {
    calls.push({url,options});
    if(url.includes('/bucket/'))return Response.json({public:false});
    if(options.method==='POST'){bytes=options.body;return Response.json({});}
    if(options.method==='DELETE')return Response.json({});
    return new Response(bytes);
  });
  await store.check();const ref=await store.put(Buffer.from('proof'));assert.equal((await store.get(ref)).toString(),'proof');await store.remove(ref);
  assert.ok(calls.every(({options})=>options.headers.apikey==='sb_secret_test' && !options.headers.Authorization));
  assert.ok(calls.every(({url})=>!url.includes('/public/')));
  const bad=createObjectStorage({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'},async()=>Response.json({public:true}));
  await assert.rejects(bad.check(),/must be private/);
  assert.equal(postgresSql('INSERT OR IGNORE INTO categories VALUES (?, ?, ?)'),'INSERT INTO categories VALUES ($1, $2, $3) ON CONFLICT DO NOTHING');
});

test('database TLS accepts real and escaped PEM newlines without disabling verification', () => {
  const pem = rootCertificates[0];
  assert.deepEqual(databaseTlsOptions(), { rejectUnauthorized: true });
  for (const value of [pem, pem.replaceAll('\n', '\\n'), '"' + pem.replaceAll('\n', '\\n') + '"']) {
    const ssl = databaseTlsOptions(value);
    assert.equal(ssl.rejectUnauthorized, true);
    assert.equal(ssl.ca[0], pem.trim());
  }
  assert.throws(() => databaseTlsOptions('certificate.crt'), /complete PEM/);
  assert.throws(() => databaseTlsOptions('-----BEGIN CERTIFICATE-----\nbad\n-----END CERTIFICATE-----'), /not a valid/);
});
