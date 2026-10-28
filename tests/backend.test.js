import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createLocations } from '../server/locations.js';
import { nodeHandler } from '../server/http.js';
import { Readable } from 'node:stream';

const cities = [
  { code: '137404000', name: 'Quezon City', region: { code: '130000000', name: 'National Capital Region' }, province: null },
  { code: '042109000', name: 'Dasmariñas', region: { code: '040000000', name: 'CALABARZON' }, province: { code: '042100000', name: 'Cavite' } },
];
const barangays = [{ code: '137404001', name: 'Alicia' }];
const directory = { regions: async () => [cities[0].region, cities[1].region], provinces: async () => [{ ...cities[1].province, regionCode: cities[1].region.code }], cities: async () => cities, barangays: async (code) => code === cities[0].code ? barangays : [] };
function fixture(context, options = {}) {
  const db = openDatabase(':memory:');
  const clock = { value: Date.now() };
  const app = createApp({ db, locations: directory, env: {}, now: () => clock.value, ...options });
  context.after(() => db.close());
  return { app, db, clock };
}
function client(app, ip = 'test') {
  let cookie = '';
  return {
    get cookie() { return cookie; },
    async request(path, { method = 'GET', body, headers = {}, csrf = true, origin = 'http://bidwave.test' } = {}) {
      const form = body instanceof FormData;
      const response = await app.handle(new Request(`http://bidwave.test/api${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-bidwave-request': '1' } : {}), ...(origin ? { origin } : {}), ...(body && !form ? { 'content-type': 'application/json' } : {}), ...headers },
        ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
      }), { ip });
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const content = response.headers.get('content-type') || '';
      const data = content.includes('application/json') ? await response.json() : null;
      return { response, status: response.status, data };
    },
    signup(email = `${ip}@gmail.com`) { return this.request('/auth/signup', { method: 'POST', body: { name: ip, email, password: 'test-password-123' } }); },
  };
}
function addressBody(overrides = {}) { return { recipient: 'Test Buyer', phone: '09171234567', street: 'Unit 2, 123 Example Street', postalCode: '1105', mode: 'directory', cityCode: cities[0].code, barangayCode: barangays[0].code, ...overrides }; }
function proofBody({ method = 'gcash', mime = 'image/png', bytes, size } = {}) {
  const body = new FormData();
  body.set('method', method); body.set('reference', 'SAMPLE-REF-001');
  body.set('proof', new Blob([bytes || (size ? new Uint8Array(size) : new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]))], { type: mime }), 'sample.png');
  return body;
}

function sellerBody(overrides = {}) {
  return { contactName: 'Seller', phone: '09170000000', link: 'https://example.com/seller', methods: [{ id: 'gcash', accountName: 'Seller Account', accountNumber: '09170000000' }], ...overrides };
}
function listingBody(overrides = {}) {
  return { title: 'Real listing', description: 'An item sold by a registered seller', category: 'fashion', image: 'https://example.com/item.jpg', startingPrice: 100, increment: 100, duration: 1, location: { cityCode: cities[0].code, barangayCode: barangays[0].code }, ...overrides };
}

test('real signup accepts an unverified test email, hashes passwords, restores sessions and revokes logout', async (context) => {
  const { app, db } = fixture(context);
  const visitor = client(app, 'Alice');
  const signup = await visitor.signup('  Fake.BidWave@gmail.com ');
  assert.equal(signup.status, 201);
  assert.equal(signup.data.user.email, 'fake.bidwave@gmail.com');
  assert.ok(signup.response.headers.get('set-cookie').includes('HttpOnly'));
  assert.ok(signup.response.headers.get('set-cookie').includes('SameSite=Lax'));
  assert.equal(signup.data.user.password_hash, undefined);
  const saved = db.prepare('SELECT * FROM users').get();
  assert.notEqual(saved.password_hash, 'test-password-123');
  assert.match(saved.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal((await visitor.request('/session')).data.user.id, signup.data.user.id);
  const second = client(app, 'other');
  assert.equal((await second.signup('fake.bidwave@gmail.com')).status, 409);
  assert.equal((await second.request('/auth/login', { method: 'POST', body: { email: saved.email, password: 'wrong-password' } })).status, 401);
  const oldCookie = visitor.cookie;
  assert.equal((await visitor.request('/auth/logout', { method: 'POST' })).status, 200);
  const revoked = await app.handle(new Request('http://bidwave.test/api/session', { headers: { cookie: oldCookie } }));
  assert.equal((await revoked.json()).user, null);
  assert.equal((await visitor.request('/auth/login', { method: 'POST', body: { email: 'FAKE.BIDWAVE@GMAIL.COM', password: 'test-password-123' } })).status, 200);
});

test('mutations require same-origin request headers, authenticated endpoints reject guests, and login attempts are limited', async (context) => {
  const { app } = fixture(context);
  const visitor = client(app);
  assert.equal((await visitor.request('/auth/signup', { method: 'POST', csrf: false, body: {} })).status, 403);
  assert.equal((await visitor.request('/auth/signup', { method: 'POST', origin: 'https://attacker.test', body: {} })).status, 403);
  assert.equal((await visitor.request('/account/address')).status, 401);
  assert.equal((await visitor.request('/account/orders')).status, 401);
  assert.equal((await visitor.request('/auth/logout', { method: 'POST' })).status, 200);
  for (let i = 0; i < 30; i++) await visitor.request('/auth/login', { method: 'POST', body: {} });
  assert.equal((await visitor.request('/auth/login', { method: 'POST', body: {} })).status, 429);
});

test('accounts and sessions persist when the database is reopened', async (context) => {
  const dir = mkdtempSync(join(tmpdir(), 'bidwave-db-'));
  context.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'accounts.sqlite');
  let db = openDatabase(path);
  const first = client(createApp({ db, env: {} }), 'persistent');
  const signup = await first.signup(); const cookie = first.cookie;
  db.close();
  db = openDatabase(path); context.after(() => db.close());
  const restarted = createApp({ db, env: {} });
  const response = await restarted.handle(new Request('http://bidwave.test/api/session', { headers: { cookie } }));
  assert.equal((await response.json()).user.id, signup.data.user.id);
});

test('password changes invalidate other sessions and old passwords', async (context) => {
  const { app } = fixture(context);
  const a = client(app, 'password'); await a.signup();
  const b = client(app, 'password-second');
  await b.request('/auth/login', { method: 'POST', body: { email: 'password@gmail.com', password: 'test-password-123' } });
  const changed = await a.request('/account/password', { method: 'POST', body: { currentPassword: 'test-password-123', password: 'a-different-password' } });
  assert.equal(changed.status, 200);
  assert.equal((await a.request('/session')).data.user.name, 'password');
  assert.equal((await b.request('/session')).data.user, null);
  assert.equal((await b.request('/auth/login', { method: 'POST', body: { email: 'password@gmail.com', password: 'test-password-123' } })).status, 401);
});

test('server bidding validates identity, current price and expiry; only the winner gets an order', async (context) => {
  const { app, clock } = fixture(context);
  const a = client(app, 'bidder-a'); const b = client(app, 'bidder-b');
  const accountA = (await a.signup()).data.user; await b.signup();
  assert.equal((await a.request('/auctions/studio-headphones/bids', { method: 'POST', body: { amount: 2600, bidderId: 'spoofed-user' } })).status, 201);
  const live = (await b.request('/auctions')).data.auctions.find((item) => item.id === 'studio-headphones');
  assert.equal(live.bids[0].bidderId, accountA.id);
  assert.equal((await b.request('/auctions/studio-headphones/bids', { method: 'POST', body: { amount: 2600 } })).status, 409);
  assert.equal((await b.request('/auctions/studio-headphones/bids', { method: 'POST', body: { amount: 2700 } })).status, 201);
  clock.value = live.endsAt;
  assert.equal((await a.request('/auctions/studio-headphones/bids', { method: 'POST', body: { amount: 2800 } })).status, 409);
  assert.equal((await a.request('/account/orders')).data.orders.length, 0);
  const orders = (await b.request('/account/orders')).data.orders;
  assert.equal(orders.length, 1); assert.equal(orders[0].amount, 2700); assert.equal(orders[0].demo, true);
  assert.equal((await b.request('/account/orders')).data.orders[0].id, orders[0].id);
});

test('listings are server-owned and reject self bids and invalid durations', async (context) => {
  const { app } = fixture(context);
  const a = client(app, 'seller'); const user = (await a.signup()).data.user;
  await a.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const values = { increment: 100, location: addressBody(), title: 'Test item', description: 'A test listing', category: 'fashion', image: 'https://example.com/item.jpg', startingPrice: 100, duration: 1, seller: { id: 'spoof' } };
  const created = await a.request('/auctions', { method: 'POST', body: values });
  assert.equal(created.status, 201); assert.equal(created.data.auction.seller.id, user.id);
  assert.equal((await a.request(`/auctions/${created.data.auction.id}/bids`, { method: 'POST', body: { amount: 101 } })).status, 409);
  assert.equal((await a.request('/auctions', { method: 'POST', body: { ...values, duration: 365 } })).status, 400);
});

test('address hierarchy is filled by server lookup, invalid barangays rejected, addresses isolated', async (context) => {
  const { app } = fixture(context);
  const a = client(app, 'address-a'); const b = client(app, 'address-b'); await a.signup(); await b.signup();
  const saved = await a.request('/account/address', { method: 'PUT', body: addressBody({ region: 'Spoofed region' }) });
  assert.equal(saved.status, 200); assert.equal(saved.data.address.region, 'National Capital Region'); assert.equal(saved.data.address.province, '');
  assert.equal((await b.request('/account/address')).data.address, null);
  assert.equal((await a.request('/account/address', { method: 'PUT', body: addressBody({ barangayCode: 'invalid' }) })).status, 400);
  assert.equal((await a.request('/account/address', { method: 'DELETE' })).status, 200);
  assert.equal((await a.request('/account/address')).data.address, null);
});

test('sample payment upload stays pending, receipts are truthful and proof files are private', async (context) => {
  const { app } = fixture(context);
  const a = client(app, 'payment-a'); const b = client(app, 'payment-b'); await a.signup(); await b.signup();
  const order = (await a.request('/account/orders/demo', { method: 'POST' })).data.order;
  assert.equal(order.demo, true);
  assert.equal((await a.request('/account/orders/demo', { method: 'POST' })).data.order.id, order.id);
  const uploaded = await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() });
  assert.equal(uploaded.status, 201);
  const payment = uploaded.data.payment;
  assert.equal(payment.status, 'pending_verification'); assert.equal(payment.method, 'GCash');
  assert.equal((await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() })).status, 409);
  assert.equal((await b.request(`/account/payments/${payment.id}/proof`)).status, 404);
  assert.equal((await b.request(`/account/payments/${payment.id}/receipt`)).status, 404);
  assert.equal((await b.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() })).status, 404);
  const receipt = await a.request(`/account/payments/${payment.id}/receipt`);
  assert.match(await receipt.response.text(), /PENDING VERIFICATION[\s\S]*does NOT confirm/);
  assert.match(receipt.response.headers.get('content-disposition'), /attachment/);
  const original = await a.request(`/account/payments/${payment.id}/proof`);
  assert.equal(original.response.headers.get('content-type'), 'image/png');
  assert.equal((await original.response.arrayBuffer()).byteLength, 9);
});

test('uploads reject oversized or disguised files and do not create payment records', async (context) => {
  const { app, db } = fixture(context);
  const a = client(app, 'bad-file'); await a.signup();
  const order = (await a.request('/account/orders/demo', { method: 'POST' })).data.order;
  assert.equal((await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody({ bytes: '<svg></svg>' }) })).status, 400);
  assert.equal((await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody({ size: 5 * 1024 * 1024 + 1 }) })).status, 400);
  assert.equal((await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody({ method: 'invalid' }) })).status, 400);
  assert.equal(db.prepare('SELECT count(*) AS count FROM payments').get().count, 0);
});

test('real winning orders use seller details and require a saved shipping address', async (context) => {
  const { app, clock } = fixture(context);
  const seller = client(app, 'actual-seller'); await seller.signup();
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const created = await seller.request('/auctions', { method: 'POST', body: listingBody() });
  assert.equal(created.status, 201);
  const a = client(app, 'actual-winner'); await a.signup();
  await a.request(`/auctions/${created.data.auction.id}/bids`, { method: 'POST', body: { amount: 100 } });
  clock.value = created.data.auction.endsAt;
  const order = (await a.request('/account/orders')).data.orders[0];
  assert.equal(order.demo, false);
  assert.equal(order.settlement.phone, '09170000000');
  assert.equal((await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() })).status, 409);
  await a.request('/account/address', { method: 'PUT', body: addressBody() });
  const result = await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() });
  assert.equal(result.status, 201);
  assert.equal(result.data.payment.shippingAddress.city, 'Quezon City');
  assert.equal(result.data.payment.status, 'pending_verification');
});

test('expired sessions fail authentication and production sessions use Secure cookies', async (context) => {
  const { app, clock } = fixture(context, { env: { NODE_ENV: 'production', APP_ORIGIN: 'http://bidwave.test' } });
  const a = client(app, 'secure'); const signup = await a.signup();
  assert.match(signup.response.headers.get('set-cookie'), /__Host-bidwave_session=/);
  assert.match(signup.response.headers.get('set-cookie'), /; Secure/);
  clock.value += 8 * 86400000;
  assert.equal((await a.request('/session')).data.user, null);
  assert.equal((await a.request('/account/address')).status, 401);
});

test('local location snapshot supports the full hierarchy including province-free cities', async () => {
  const locations = createLocations();
  assert.equal((await locations.regions()).length, 17);
  assert.equal((await locations.provinces()).length, 82);
  assert.equal((await locations.cities()).length, 1642);
  const manila = (await locations.cities()).find((c) => c.code === '1380600000');
  assert.equal(manila.province, null);
  assert.equal((await locations.barangays(manila.code)).length, 897);
  const total = await Promise.all((await locations.cities()).map((c) => locations.barangays(c.code)));
  assert.equal(total.reduce((n, list) => n + list.length, 0), 42001);
});

test('all four payment methods accept matching proof types and use the server order amount', async (context) => {
  const { app } = fixture(context);
  const cases = [
    ['gcash', 'GCash', 'image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])],
    ['maya', 'Maya', 'image/jpeg', new Uint8Array([255, 216, 255, 0])],
    ['maribank', 'MariBank', 'image/webp', 'RIFF0000WEBP'],
    ['bank', 'Bank account', 'application/pdf', '%PDF-1.4\nsample'],
  ];
  for (const [method, label, mime, bytes] of cases) {
    const a = client(app, `method-${method}`); await a.signup();
    const order = (await a.request('/account/orders/demo', { method: 'POST' })).data.order;
    const form = proofBody({ method, mime, bytes }); form.set('amount', '1');
    const uploaded = await a.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: form });
    assert.equal(uploaded.status, 201); assert.equal(uploaded.data.payment.method, label);
    assert.equal(uploaded.data.payment.amount, 2500); assert.equal(uploaded.data.payment.status, 'pending_verification');
  }
});

test('manual address autofill remains usable when the directory is offline', async (context) => {
  const { app } = fixture(context, { locations: { cities() { throw new Error('offline'); } } });
  const a = client(app, 'offline-address'); await a.signup();
  assert.equal((await a.request('/locations/cities')).status, 503);
  const saved = await a.request('/account/address', { method: 'PUT', body: { ...addressBody(), mode: 'manual', region: 'NCR', province: '', city: 'Quezon City', barangay: 'Alicia' } });
  assert.equal(saved.status, 200); assert.equal(saved.data.address.city, 'Quezon City');
});

test('HTTP adapter preserves sessions and limits request bodies without binding a port', async (context) => {
  const { app } = fixture(context);
  const handler = nodeHandler(app);
  async function invoke(path, body) {
    const request = Readable.from([body]);
    Object.assign(request, { method: 'POST', url: path, headers: { host: 'bidwave.test', 'content-type': 'application/json', 'x-bidwave-request': '1' }, socket: { remoteAddress: 'adapter-test' } });
    const result = {};
    const response = { writeHead(status, headers) { result.status = status; result.headers = headers; }, end(data) { result.body = Buffer.from(data || ''); } };
    await handler(request, response);
    return result;
  }
  const result = await invoke('/api/auth/signup', Buffer.from(JSON.stringify({ name: 'Adapter', email: 'adapter@gmail.com', password: 'test-password-123' })));
  assert.equal(result.status, 201); assert.ok(result.headers['set-cookie']);
  assert.equal(JSON.parse(result.body.toString()).user.name, 'Adapter');
  const tooBig = await invoke('/api/auth/signup', Buffer.alloc(21 * 1024 * 1024 + 1));
  assert.equal(tooBig.status, 413);
});

test('new listings enforce seller setup, increments, custom dates and category deduplication', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'custom-seller'); await seller.signup();
  assert.equal((await seller.request('/auctions', { method: 'POST', body: listingBody() })).status, 409);
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  for (const increment of [-1, 1.5]) assert.equal((await seller.request('/auctions', { method: 'POST', body: listingBody({ increment }) })).status, 400);
  assert.equal((await seller.request('/auctions', { method: 'POST', body: listingBody({ duration: 'custom', endsAt: clock.value + 299999 }) })).status, 400);
  assert.equal((await seller.request('/auctions', { method: 'POST', body: listingBody({ duration: 'custom', endsAt: clock.value + 31 * 86400000 }) })).status, 400);
  assert.equal((await seller.request('/auctions', { method: 'POST', body: listingBody({ duration: 1, endsAt: clock.value + 600000 }) })).status, 400);
  const first = await seller.request('/auctions', { method: 'POST', body: listingBody({ customCategory: ' Musical   Instruments ', duration: 'custom', endsAt: clock.value + 600000 }) });
  assert.equal(first.status, 201); assert.equal(first.data.auction.endsAt, clock.value + 600000);
  const second = await seller.request('/auctions', { method: 'POST', body: listingBody({ customCategory: 'musical instruments' }) });
  assert.equal(second.status, 201); assert.equal(second.data.auction.category, first.data.auction.category);
  assert.equal(db.prepare('SELECT count(*) AS count FROM categories').get().count, 4);
  assert.equal((await client(app, 'public').request('/categories')).data.categories.length, 4);
  const bidder = client(app, 'increment-bidder'); await bidder.signup();
  const optional = await seller.request('/auctions', { method: 'POST', body: listingBody({ increment: 0 }) });
  assert.equal(optional.status, 201); assert.equal(optional.data.auction.increment, 0);
  const optionalId = optional.data.auction.id;
  assert.equal((await bidder.request(`/auctions/${optionalId}/bids`, { method: 'POST', body: { amount: 100 } })).status, 201);
  assert.equal((await bidder.request(`/auctions/${optionalId}/bids`, { method: 'POST', body: { amount: 100 } })).status, 409);
  assert.equal((await bidder.request(`/auctions/${optionalId}/bids`, { method: 'POST', body: { amount: 101 } })).status, 201);
  const id = first.data.auction.id;
  assert.equal((await bidder.request(`/auctions/${id}/bids`, { method: 'POST', body: { amount: 100 } })).status, 201);
  assert.equal((await bidder.request(`/auctions/${id}/bids`, { method: 'POST', body: { amount: 199 } })).status, 409);
  assert.equal((await bidder.request(`/auctions/${id}/bids`, { method: 'POST', body: { amount: 251 } })).status, 201);
});

test('finalization notifies winner, loser and seller once; seller contacts and QR stay winner-only', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'notify-seller'); const sellerUser = (await seller.signup()).data.user;
  const settingsForm = new FormData(); settingsForm.set('metadata', JSON.stringify(sellerBody({ methods: [{ id: 'gcash', accountName: 'QR Seller', accountNumber: '' }] })));
  settingsForm.set('qr_gcash', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' }), 'seller-qr.png');
  const settings = await seller.request('/account/seller', { method: 'PUT', body: settingsForm });
  assert.equal(settings.status, 200); const qrId = settings.data.settings.methods[0].qrId;
  const listing = new FormData(); listing.set('metadata', JSON.stringify(listingBody({ duration: 'custom', endsAt: clock.value + 600000, location: { ...listingBody().location, coordinates: { latitude: 14.604321, longitude: 121.047891 } } })));
  listing.set('image', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: 'image/png' }), 'product.png');
  const published = await seller.request('/auctions', { method: 'POST', body: listing });
  assert.equal(published.status, 201); const auction = published.data.auction;
  assert.equal(auction.hasDistance, true); assert.equal(auction.location.city, 'Quezon City');
  assert.equal(auction.settlement, undefined); assert.equal(auction.location.coordinates, undefined);
  assert.equal((await client(app).request(auction.image.replace('/api', ''))).status, 200);
  assert.equal((await client(app).request(`/media/${qrId}`)).status, 404);
  assert.equal((await seller.request(`/media/${qrId}`)).status, 200);
  const loser = client(app, 'notified-loser'); await loser.signup();
  const winner = client(app, 'notified-winner'); const winnerUser = (await winner.signup()).data.user;
  await loser.request(`/auctions/${auction.id}/bids`, { method: 'POST', body: { amount: 100 } });
  await winner.request(`/auctions/${auction.id}/bids`, { method: 'POST', body: { amount: 251 } });
  const measured = await winner.request(`/auctions/${auction.id}/distance`, { method: 'POST', body: { latitude: 14.6, longitude: 121.05 } });
  assert.equal(measured.status, 200); assert.equal(measured.data.distanceKm, 0);
  const privateAuction = JSON.parse(db.prepare('SELECT data FROM auctions WHERE id = ?').get(auction.id).data);
  assert.deepEqual(privateAuction.location.coordinates, { latitude: 14.6, longitude: 121.05 });
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody({ phone: '09999999999' }) });
  clock.value = auction.endsAt;
  app.finalize(); app.finalize();
  const result = (await winner.request('/account/orders')).data.orders[0];
  assert.equal(result.settlement.phone, '09170000000'); assert.equal(result.settlement.methods[0].qrId, qrId);
  assert.equal((await winner.request(`/account/orders/${result.id}/settlement`)).status, 200);
  assert.equal((await winner.request(`/account/orders/${result.id}/qr/gcash`)).status, 200);
  assert.equal((await loser.request(`/account/orders/${result.id}/settlement`)).status, 404);
  assert.equal((await loser.request(`/account/orders/${result.id}/qr/gcash`)).status, 404);
  const won = (await winner.request('/account/notifications')).data.notifications;
  const lost = (await loser.request('/account/notifications')).data.notifications;
  assert.equal(won.length, 1); assert.equal(won[0].type, 'auction_won'); assert.equal(lost.length, 1); assert.equal(lost[0].type, 'auction_lost');
  assert.equal((await seller.request('/account/notifications')).data.notifications[0].type, 'auction_sold');
  assert.equal((await loser.request(`/account/notifications/${won[0].id}`, { method: 'PATCH', body: { read: true } })).status, 404);
  await winner.request(`/account/notifications/${won[0].id}`, { method: 'PATCH', body: { read: true } });
  assert.equal((await winner.request('/account/notifications')).data.notifications[0].readAt, clock.value);
  await winner.request(`/account/notifications/${won[0].id}`, { method: 'PATCH', body: { read: false } });
  assert.equal((await winner.request('/account/notifications')).data.notifications[0].readAt, null);
  await winner.request('/account/notifications/read-all', { method: 'POST' });
  assert.equal((await winner.request('/account/notifications')).data.notifications[0].readAt, clock.value);
  assert.equal(db.prepare('SELECT count(*) AS count FROM orders WHERE auction_id = ?').get(auction.id).count, 1);
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(sellerUser.id));
  assert.ok(db.prepare('SELECT id FROM users WHERE id = ?').get(winnerUser.id));
  const publicResult = JSON.stringify((await client(app).request('/auctions')).data);
  assert.ok(!publicResult.includes('09170000000')); assert.ok(!publicResult.includes(qrId)); assert.ok(!publicResult.includes('coordinates'));
  await winner.request('/account/address', { method: 'PUT', body: addressBody() });
  assert.equal((await winner.request(`/account/orders/${result.id}/proof`, { method: 'POST', body: proofBody() })).status, 201);
});

test('invalid photo and QR uploads do not leave categories or media behind', async (context) => {
  const { app, db } = fixture(context);
  const seller = client(app, 'bad-media'); await seller.signup();
  const qr = new FormData(); qr.set('metadata', JSON.stringify(sellerBody({ methods: [{ id: 'gcash', accountName: 'Seller', accountNumber: '' }] }))); qr.set('qr_gcash', new Blob(['<svg></svg>'], { type: 'image/png' }), 'fake.png');
  assert.equal((await seller.request('/account/seller', { method: 'PUT', body: qr })).status, 400);
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  for (const blob of [new Blob(['bad'], { type: 'image/png' }), new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })]) {
    const form = new FormData(); form.set('metadata', JSON.stringify(listingBody({ customCategory: 'Should not exist' }))); form.set('image', blob, 'bad.png');
    assert.equal((await seller.request('/auctions', { method: 'POST', body: form })).status, 400);
  }
  assert.equal(db.prepare('SELECT count(*) AS count FROM media').get().count, 0);
  assert.equal(db.prepare('SELECT count(*) AS count FROM categories').get().count, 3);
});

test('server restarts catch up expired auctions without duplicating outcomes', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'restart-seller'); await seller.signup(); await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  const bidder = client(app, 'restart-bidder'); const user = (await bidder.signup()).data.user;
  await bidder.request(`/auctions/${a.id}/bids`, { method: 'POST', body: { amount: 100 } });
  clock.value = a.endsAt;
  const restarted = createApp({ db, locations: directory, env: {}, now: () => clock.value });
  assert.equal(db.prepare('SELECT count(*) AS count FROM notifications WHERE user_id = ?').get(user.id).count, 1);
  restarted.finalize();
  assert.equal(db.prepare('SELECT count(*) AS count FROM notifications WHERE user_id = ?').get(user.id).count, 1);
});

test('legacy seller setup completes missing order details without replacing submitted payment snapshots', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'legacy-seller'); const sellerUser = (await seller.signup()).data.user;
  const buyer = client(app, 'legacy-buyer'); const buyerUser = (await buyer.signup()).data.user;
  const original = { ...listingBody(), id: 'legacy-auction', image: 'https://example.com/item.jpg', currentBid: 100, seller: sellerUser, endsAt: clock.value, bids: [{ id: 'old-bid', bidder: buyerUser.name, bidderId: buyerUser.id, amount: 100, at: clock.value - 1000 }] };
  db.prepare('INSERT INTO auctions VALUES (?, ?)').run(original.id, JSON.stringify(original));
  const order = (await buyer.request('/account/orders')).data.orders[0]; assert.equal(order.settlement, null);
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  assert.equal((await buyer.request('/account/orders')).data.orders[0].settlement.phone, '09170000000');
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody({ phone: '09999999999' }) });
  assert.equal((await buyer.request('/account/orders')).data.orders[0].settlement.phone, '09170000000');
});

test('sellers edit active listings before bids, including price, category, photo, location and deadline', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'editing-seller'); await seller.signup(); await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const original = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  const loaded = await seller.request(`/account/listings/${original.id}`);
  assert.equal(loaded.status, 200); assert.equal(loaded.data.editable, true); assert.equal(loaded.data.hasBids, false); assert.equal(loaded.data.auction.location.cityCode, cities[0].code);
  const form = new FormData();
  form.set('metadata', JSON.stringify({ revision: 0, title: 'Updated title', description: 'Updated description', startingPrice: 500, increment: 50, customCategory: 'Home goods', endsAt: clock.value + 3600000, location: { mode: 'manual', region: 'Updated region', province: '', city: 'Updated city', barangay: 'Updated barangay' } }));
  form.set('image', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' }), 'updated.png');
  const saved = await seller.request(`/auctions/${original.id}`, { method: 'PATCH', body: form });
  assert.equal(saved.status, 200); const a = saved.data.auction;
  assert.equal(a.id, original.id); assert.equal(a.title, 'Updated title'); assert.equal(a.startingPrice, 500); assert.equal(a.currentBid, 500); assert.equal(a.increment, 50);
  assert.equal(a.endsAt, clock.value + 3600000); assert.equal(a.categoryName, 'Home goods'); assert.equal(a.location.city, 'Updated city'); assert.equal(a.revision, 1);
  assert.match(a.image, /^\/api\/media\//); assert.equal(a.bids.length, 0); assert.equal(a.settlement, undefined);
  const stored = JSON.parse(db.prepare('SELECT data FROM auctions WHERE id = ?').get(a.id).data);
  assert.equal(stored.settlement.phone, '09170000000'); assert.deepEqual(stored.seller, original.seller);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 0, endsAt: a.endsAt + 600000 } })).status, 409);
});

test('only the owner can open or update an editor; invalid deadlines leave the listing unchanged', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'edit-owner'); await seller.signup(); await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  const other = client(app, 'edit-outsider'); await other.signup();
  assert.equal((await client(app).request(`/account/listings/${a.id}`)).status, 401);
  assert.equal((await client(app).request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 0, endsAt: a.endsAt + 600000 } })).status, 401);
  assert.equal((await other.request(`/account/listings/${a.id}`)).status, 404);
  assert.equal((await other.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 0, endsAt: a.endsAt + 600000 } })).status, 404);
  for (const endsAt of [clock.value - 1, clock.value + 299999, clock.value + 31 * 86400000, 'not-a-date']) assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 0, endsAt } })).status, 400);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { endsAt: a.endsAt + 600000 } })).status, 400);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM auctions WHERE id = ?').get(a.id).data).endsAt, a.endsAt);
});

test('after bidding starts, only extensions are allowed and bidders receive each deadline change once', async (context) => {
  const { app, clock } = fixture(context);
  const seller = client(app, 'extension-seller'); await seller.signup(); await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  const bidder = client(app, 'extension-bidder'); await bidder.signup();
  const bid = (await bidder.request(`/auctions/${a.id}/bids`, { method: 'POST', body: { amount: 100 } })).data.auction;
  assert.equal(bid.revision, 1);
  const editor = (await seller.request(`/account/listings/${a.id}`)).data; assert.equal(editor.hasBids, true);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 1, endsAt: a.endsAt - 600000 } })).status, 409);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 1, endsAt: a.endsAt + 600000, startingPrice: 200 } })).status, 409);
  const extension = await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 1, endsAt: a.endsAt + 3600000 } });
  assert.equal(extension.status, 200); assert.deepEqual(extension.data.auction.bids, bid.bids); assert.equal(extension.data.auction.currentBid, 100);
  assert.equal((await bidder.request('/account/notifications')).data.notifications.length, 1);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 1, endsAt: a.endsAt + 7200000 } })).status, 409);
  const next = await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 2, endsAt: a.endsAt + 7200000 } });
  assert.equal(next.status, 200);
  const notifications = (await bidder.request('/account/notifications')).data.notifications;
  assert.equal(notifications.length, 2); assert.ok(notifications.every((n) => n.type === 'deadline_changed' && n.href === `/auctions/${a.id}`));
  clock.value = a.endsAt; app.finalize(); assert.equal((await bidder.request('/account/orders')).data.orders.length, 0);
  clock.value = next.data.auction.endsAt; app.finalize();
  assert.equal((await bidder.request('/account/orders')).data.orders.length, 1);
  assert.equal((await bidder.request('/account/notifications')).data.notifications.filter((n) => n.type === 'auction_won').length, 1);
});

test('expired and finalized listings cannot be reopened, even before the worker has run', async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'ended-editor'); await seller.signup(); await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  clock.value = a.endsAt;
  assert.equal((await seller.request(`/account/listings/${a.id}`)).data.editable, false);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 0, endsAt: clock.value + 3600000 } })).status, 409);
  app.finalize();
  const stored = JSON.parse(db.prepare('SELECT data FROM auctions WHERE id = ?').get(a.id).data);
  stored.endsAt = clock.value + 3600000;
  db.prepare('UPDATE auctions SET data = ? WHERE id = ?').run(JSON.stringify(stored), a.id);
  assert.equal((await seller.request(`/account/listings/${a.id}`)).data.editable, false);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: 0, endsAt: clock.value + 7200000 } })).status, 409);
});

test('a bid arriving during edit validation prevents stale metadata or media from being committed', { timeout: 5000 }, async (context) => {
  const { app, db, clock } = fixture(context);
  const seller = client(app, 'racing-editor'); await seller.signup(); await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  const bidder = client(app, 'racing-bidder'); await bidder.signup();
  let release; let started;
  const waiting = new Promise((resolve) => { release = resolve; }); const validationStarted = new Promise((resolve) => { started = resolve; });
  const editingApp = createApp({ db, env: {}, now: () => clock.value, locations: { ...directory, cities: async () => { started(); await waiting; return cities; } } });
  const form = new FormData(); form.set('metadata', JSON.stringify({ revision: 0, endsAt: a.endsAt + 3600000, title: 'Stale changed item', customCategory: 'Should not be created', location: listingBody().location }));
  form.set('image', new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' }), 'stale.png');
  const request = editingApp.handle(new Request(`http://bidwave.test/api/auctions/${a.id}`, { method: 'PATCH', headers: { cookie: seller.cookie, 'x-bidwave-request': '1' }, body: form }));
  await validationStarted;
  assert.equal((await bidder.request(`/auctions/${a.id}/bids`, { method: 'POST', body: { amount: 100 } })).status, 201);
  release(); assert.equal((await request).status, 409);
  const stored = JSON.parse(db.prepare('SELECT data FROM auctions WHERE id = ?').get(a.id).data);
  assert.equal(stored.title, a.title); assert.equal(stored.bids.length, 1); assert.equal(stored.revision, 1);
  assert.equal(db.prepare('SELECT count(*) AS count FROM categories').get().count, 3);
  assert.equal(db.prepare('SELECT count(*) AS count FROM media').get().count, 0);
});

test('active listings can change item details after bids while preserving bids and notifying bidders', async (context) => {
  const { app } = fixture(context);
  const seller = client(app, 'active-editor'); await seller.signup();
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  const bidder = client(app, 'active-bidder'); await bidder.signup();
  const bid = (await bidder.request(`/auctions/${a.id}/bids`, { method: 'POST', body: { amount: 100 } })).data.auction;
  const changed = await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: bid.revision, endsAt: a.endsAt, title: 'Updated item title', description: 'More accurate item details', image: 'https://example.com/updated.jpg' } });
  assert.equal(changed.status, 200); assert.equal(changed.data.auction.title, 'Updated item title');
  assert.equal(changed.data.auction.image, 'https://example.com/updated.jpg');
  assert.equal(changed.data.auction.currentBid, bid.currentBid); assert.deepEqual(changed.data.auction.bids, bid.bids);
  const notices = (await bidder.request('/account/notifications')).data.notifications;
  assert.equal(notices.filter((n) => n.type === 'listing_changed').length, 1);
  assert.equal((await seller.request(`/auctions/${a.id}`, { method: 'PATCH', body: { revision: changed.data.auction.revision, endsAt: a.endsAt, increment: 0 } })).status, 409);
});

test('seller reviews reject, resubmit and confirm privately with preserved history', async (context) => {
  const { app, clock } = fixture(context);
  const seller = client(app, 'review-seller'), buyer = client(app, 'review-buyer'), other = client(app, 'review-other');
  await seller.signup(); await buyer.signup(); await other.signup();
  await seller.request('/account/seller', { method: 'PUT', body: sellerBody() });
  const a = (await seller.request('/auctions', { method: 'POST', body: listingBody() })).data.auction;
  await buyer.request(`/auctions/${a.id}/bids`, { method: 'POST', body: { amount: 100 } });
  clock.value = a.endsAt; app.finalize();
  const order = (await buyer.request('/account/orders')).data.orders[0];
  await buyer.request('/account/address', { method: 'PUT', body: addressBody() });
  const first = (await buyer.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() })).data.payment;
  assert.equal((await seller.request('/account/sales')).data.sales[0].payment.id, first.id);
  assert.equal((await other.request('/account/sales')).data.sales.length, 0);
  const decide = (who, paymentId, decision, rejectionReason) => who.request(`/account/sales/${order.id}/payment`, { method: 'PATCH', body: { paymentId, decision, rejectionReason } });
  assert.equal((await decide(other, first.id, 'confirmed')).status, 404);
  assert.equal((await decide(seller, first.id, 'rejected')).status, 400);
  assert.equal((await decide(seller, first.id, 'rejected', 'Reference does not match')).status, 200);
  const second = await buyer.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() });
  assert.equal(second.status, 201);
  assert.equal((await seller.request(`/account/payments/${first.id}/proof`)).status, 200);
  assert.equal((await other.request(`/account/payments/${first.id}/proof`)).status, 404);
  assert.equal((await decide(seller, first.id, 'confirmed')).status, 409);
  assert.equal((await decide(seller, second.data.payment.id, 'confirmed')).status, 200);
  assert.equal((await decide(seller, second.data.payment.id, 'rejected', 'Oops')).status, 409);
  assert.equal((await buyer.request(`/account/orders/${order.id}/proof`, { method: 'POST', body: proofBody() })).status, 409);
  assert.equal((await buyer.request('/account/orders')).data.orders[0].history.length, 1);
  assert.ok(!(await other.request('/auctions')).data.auctions.some((item) => item.id === a.id));
  assert.ok((await seller.request('/account/listings/archive')).data.auctions.some((item) => item.id === a.id));
  assert.equal((await buyer.request('/account/listings/archive')).data.auctions.length, 0);
  assert.equal((await buyer.request(`/account/listings/${a.id}`)).status, 404);

  const fulfill = (who, body) => who.request(`/account/orders/${order.id}/fulfillment`, { method: 'PATCH', body });
  assert.equal((await fulfill(other, { action: 'ship', carrier: 'Test courier', trackingNumber: 'TRACK-1' })).status, 404);
  assert.equal((await fulfill(buyer, { action: 'complete' })).status, 409);
  assert.equal((await fulfill(buyer, { action: 'ship', carrier: 'Test courier', trackingNumber: 'TRACK-1' })).status, 403);
  assert.equal((await fulfill(seller, { action: 'ship', carrier: '', trackingNumber: 'TRACK-1' })).status, 400);
  assert.equal((await fulfill(seller, { action: 'ship', carrier: 'Test courier', trackingNumber: 'TRACK-1' })).status, 200);
  assert.equal((await buyer.request('/account/orders')).data.orders[0].fulfillment.status, 'shipped');
  assert.equal((await fulfill(seller, { action: 'complete' })).status, 403);
  assert.equal((await fulfill(buyer, { action: 'complete' })).status, 200);
  assert.equal((await fulfill(buyer, { action: 'complete' })).status, 409);
  assert.equal((await fulfill(seller, { action: 'ship', carrier: 'Test courier', trackingNumber: 'TRACK-2' })).status, 409);
  assert.equal((await seller.request('/account/sales')).data.sales[0].fulfillment.status, 'completed');
  const action = (who, body) => who.request(`/account/orders/${order.id}/action`, { method: 'PATCH', body });
  assert.equal((await action(other, { action: 'return_request', reason: 'Broken' })).status, 404);
  assert.equal((await action(buyer, { action: 'cancel_request', reason: 'Changed mind' })).status, 409);
  assert.equal((await action(buyer, { action: 'return_request', reason: 'Damaged item' })).status, 200);
  assert.equal((await action(seller, { action: 'return_approve', instructions: 'Return to seller address, Unit 1' })).status, 200);
  assert.equal((await action(buyer, { action: 'return_ship', carrier: 'Courier', trackingNumber: 'RETURN-1' })).status, 200);
  assert.equal((await action(seller, { action: 'return_receive' })).status, 200);
  assert.equal((await action(seller, { action: 'refund_record', reference: 'REFUND-1' })).status, 409);
  assert.equal((await seller.request(`/account/orders/${order.id}/refund-proof`, { method: 'POST', body: proofBody() })).status, 200);
  assert.equal((await action(seller, { action: 'refund_record', reference: 'REFUND-1' })).status, 200);
  assert.equal((await buyer.request(`/account/orders/${order.id}/refund-proof`)).status, 200);
  assert.equal((await other.request(`/account/orders/${order.id}/refund-proof`)).status, 404);
  assert.equal((await action(buyer, { action: 'refund_confirm' })).status, 200);
  assert.equal((await action(buyer, { action: 'refund_confirm' })).status, 409);


});
