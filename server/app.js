import { randomBytes, randomUUID, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { openDatabase, transaction } from './database.js';
import { createLocations } from './locations.js';
import { ApiError } from './errors.js';
import { createMarketplace, publicAuction, METHODS } from './marketplace.js';
import { bidError } from '../src/utils/auction.js';

const scrypt = promisify(scryptCallback);
const MAX_PROOF = 5 * 1024 * 1024;
const SESSION_AGE = 7 * 86400000;
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const publicUser = (user) => user ? { id: user.id, name: user.name, email: user.email } : null;
function requireValue(condition, message, status = 400) { if (!condition) throw new ApiError(status, message); }
function text(value, label, max = 200) { requireValue(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `Enter a valid ${label} (up to ${max} characters).`); return value.trim(); }
function passwordValid(value) { requireValue(typeof value === 'string' && value.length >= 10 && value.length <= 128, 'Use a password between 10 and 128 characters.'); }
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password, saved) {
  const [salt, encoded] = saved.split(':');
  const derived = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(derived, Buffer.from(encoded, 'hex'));
}
function proofMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  return null;
}
export function paymentMethods() { return METHODS.map((m) => ({ ...m, configured: false })); }

export function createApp({ db = openDatabase(), locations = createLocations(), env = process.env, now = Date.now } = {}) {
  const marketplace = createMarketplace({ db, locations, now });
  const secure = env.NODE_ENV === 'production';
  const cookieName = secure ? '__Host-bidwave_session' : 'bidwave_session';
  const limits = new Map();
  const dummy = `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  function rateLimit(key, max = 30) {
    const time = now();
    for (const [id, entry] of limits) if (entry.until <= time) limits.delete(id);
    const entry = limits.get(key) || { count: 0, until: time + 900000 };
    entry.count += 1; limits.set(key, entry);
    requireValue(entry.count <= max && limits.size <= 10000, 'Too many attempts. Try again in 15 minutes.', 429);
  }
  function session(request) {
    const token = (request.headers.get('cookie') || '').split(';').map((v) => v.trim()).find((v) => v.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT users.*, sessions.token_hash FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?').get(hashToken(token), now()) || null;
  }
  function sessionCookie(userId) {
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, now() + SESSION_AGE);
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE / 1000}${secure ? '; Secure' : ''}`;
  }
  function json(value, status = 200, headers = {}) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } }); }
  async function body(request) { requireValue(request.headers.get('content-type')?.startsWith('application/json'), 'Send JSON data.', 415); try { const value = await request.json(); requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Send a JSON object.'); return value; } catch { throw new ApiError(400, 'Invalid JSON request.'); } }
  function allAuctions() { return db.prepare('SELECT data FROM auctions').all().map((row) => JSON.parse(row.data)); }
  function ordersFor(userId) {
    marketplace.finalize();
    return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY rowid DESC').all(userId).map((row) => {
      const payment = db.prepare('SELECT data FROM payments WHERE order_id = ?').get(row.id);
      return { ...JSON.parse(row.data), history: db.prepare('SELECT data FROM payment_history WHERE order_id = ?').all(row.id).map((p) => JSON.parse(p.data)), payment: payment ? JSON.parse(payment.data) : null };
    });
  }
  function paymentNotice(recipient, order, payment, event, title, href) {
    if (!recipient || order.demo || !order.auctionId) return;
    const id = randomUUID(); const type = `${event}:${payment.id}`;
    const notice = { id, auctionId: order.auctionId, type, title, body: order.title, href, createdAt: now() };
    db.prepare('INSERT OR IGNORE INTO notifications VALUES (?, ?, ?, ?, ?, NULL)').run(id, recipient, order.auctionId, type, JSON.stringify(notice));
  }
  async function handle(request, { ip = 'local' } = {}) {
    try {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/$/, '');
      const method = request.method;
      if (!['GET', 'HEAD'].includes(method)) {
        requireValue(request.headers.get('x-bidwave-request') === '1', 'Missing request header.', 403);
        const expected = env.APP_ORIGIN || url.origin;
        requireValue(!request.headers.get('origin') || request.headers.get('origin') === expected, 'Request origin is not allowed.', 403);
      }
      if (path === '/api/health' && method === 'GET') return json({ ok: true });
      if (path === '/api/session' && method === 'GET') return json({ user: publicUser(session(request)) });
      if (path === '/api/categories' || path.startsWith('/api/media/')) { const response = await marketplace.handle(request, session(request), url); if (response) return response; }
      if (path === '/api/auctions' && method === 'GET') return json({ auctions: allAuctions().filter((a) => a.endsAt > now()).map(publicAuction), serverTime: now() });
      if (['/api/auth/signup', '/api/auth/login'].includes(path) && method === 'POST') {
        rateLimit(`auth-ip:${ip}`);
        const values = await body(request);
        const email = text(values.email, 'email address', 254).toLowerCase();
        requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
        passwordValid(values.password);
        rateLimit(`auth-email:${email}`, 15);
        let user;
        if (path.endsWith('signup')) {
          const name = text(values.name, 'display name', 40);
          requireValue(!db.prepare('SELECT id FROM users WHERE email = ?').get(email), 'An account with this email already exists. Please sign in.', 409);
          const hash = await hashPassword(values.password);
          const id = randomUUID();
          try { db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(id, email, name, hash, now()); }
          catch (error) { if (String(error.message).includes('UNIQUE')) throw new ApiError(409, 'An account with this email already exists. Please sign in.'); throw error; }
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        } else {
          user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
          const valid = await verifyPassword(values.password, user?.password_hash || dummy);
          requireValue(user && valid, 'Email or password is incorrect.', 401);
        }
        const previous = session(request);
        if (previous) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(previous.token_hash);
        return json({ user: publicUser(user) }, path.endsWith('signup') ? 201 : 200, { 'Set-Cookie': sessionCookie(user.id) });
      }
      const user = session(request);
      if (path === '/api/auth/logout' && method === 'POST') {
        if (user) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(user.token_hash);
        return json({ ok: true }, 200, { 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}` });
      }
      requireValue(user, 'Please sign in to continue.', 401);
      if (path === '/api/auctions' && method === 'POST') rateLimit(`listing:${user.id}`, 30);
      if (/^\/api\/auctions\/[a-zA-Z0-9-]+$/.test(path) && method === 'PATCH') rateLimit(`listing-edit:${user.id}`, 30);
      if (path === '/api/account/seller' && method === 'PUT') rateLimit(`seller-settings:${user.id}`, 30);
      if (path.endsWith('/distance') && method === 'POST') rateLimit(`distance:${user.id}`, 100);
      if (path === '/api/account/listings/archive' && method === 'GET') {
        return json({ auctions: allAuctions().filter((a) => a.seller.id === user.id && a.endsAt <= now()).map(publicAuction) });
      }
      const marketResponse = await marketplace.handle(request, user, url);
      if (marketResponse) return marketResponse;
      if (path === '/api/account' && method === 'PATCH') {
        const values = await body(request);
        const name = text(values.name, 'display name', 40);
        db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
        return json({ user: { ...publicUser(user), name } });
      }
      if (path === '/api/account/password' && method === 'POST') {
        rateLimit(`password:${user.id}`, 10);
        const values = await body(request);
        requireValue(typeof values.currentPassword === 'string' && values.currentPassword.length <= 128, 'Enter your current password.');
        requireValue(await verifyPassword(values.currentPassword, user.password_hash), 'Current password is incorrect.', 400);
        passwordValid(values.password);
        const hash = await hashPassword(values.password);
        transaction(db, () => { db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id); db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); });
        return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(user.id) });
      }
      const bidMatch = path.match(/^\/api\/auctions\/([a-zA-Z0-9-]+)\/bids$/);
      if (bidMatch && method === 'POST') {
        rateLimit(`bid:${user.id}`, 100);
        const v = await body(request);
        const auction = transaction(db, () => {
          const row = db.prepare('SELECT data FROM auctions WHERE id = ?').get(bidMatch[1]);
          const a = row ? JSON.parse(row.data) : null;
          const error = bidError(a, v.amount, user, now());
          requireValue(!error, error, a ? 409 : 404);
          const bid = { id: randomUUID(), amount: v.amount, bidder: user.name, bidderId: user.id, at: now(), demo: false };
          const updated = { ...a, currentBid: v.amount, bids: [bid, ...a.bids], revision: (a.revision || 0) + 1 };
          db.prepare('UPDATE auctions SET data = ? WHERE id = ?').run(JSON.stringify(updated), a.id);
          return updated;
        });
        return json({ auction: publicAuction(auction) }, 201);
      }
      if (path === '/api/locations/tree' && method === 'GET') {
        const [regions, provinces, cities] = await Promise.all([locations.regions(), locations.provinces(), locations.cities()]);
        return json({ regions, provinces, cities });
      }
      if (path === '/api/locations/cities' && method === 'GET') {
        try { return json({ cities: await locations.cities() }); } catch { throw new ApiError(503, 'The address directory is unavailable. Retry, use browser autofill, or enter your address manually.'); }
      }
      if (path === '/api/locations/barangays' && method === 'GET') {
        const code = url.searchParams.get('city');
        requireValue(/^\d{9,10}$/.test(code || ''), 'Choose a valid city.');
        try { return json({ barangays: await locations.barangays(code) }); } catch { throw new ApiError(503, 'Barangays could not be loaded. Please retry or use manual address entry.'); }
      }
      if (path === '/api/account/address' && method === 'GET') {
        const row = db.prepare('SELECT data FROM addresses WHERE user_id = ?').get(user.id);
        return json({ address: row ? JSON.parse(row.data) : null });
      }
      if (path === '/api/account/address' && method === 'PUT') {
        const v = await body(request);
        const address = { recipient: text(v.recipient, 'recipient name', 100), phone: text(v.phone, 'phone number', 30), street: text(v.street, 'house / unit and street', 200), postalCode: text(v.postalCode, 'postal code', 4), country: 'Philippines', mode: v.mode === 'directory' ? 'directory' : 'manual' };
        requireValue(/^\d{4}$/.test(address.postalCode), 'Enter a four-digit Philippine postal code.');
        requireValue(/^[+\d\s()-]{7,30}$/.test(address.phone), 'Enter a valid contact number.');
        if (address.mode === 'directory') {
          let city; let barangay;
          try { city = (await locations.cities()).find((c) => c.code === v.cityCode); barangay = city && (await locations.barangays(city.code)).find((b) => b.code === v.barangayCode); }
          catch { throw new ApiError(503, 'The address directory is unavailable. Please retry or save using manual entry.'); }
          requireValue(city && barangay, 'Select a city and one of its barangays.');
          Object.assign(address, { city: city.name, cityCode: city.code, region: city.region.name, province: city.province?.name || '', barangay: barangay.name, barangayCode: barangay.code });
        } else {
          Object.assign(address, { city: text(v.city, 'city / municipality', 100), region: text(v.region, 'region', 100), province: typeof v.province === 'string' ? v.province.trim().slice(0, 100) : '', barangay: text(v.barangay, 'barangay', 100) });
        }
        db.prepare('INSERT INTO addresses (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').run(user.id, JSON.stringify(address));
        return json({ address });
      }
      if (path === '/api/account/address' && method === 'DELETE') { db.prepare('DELETE FROM addresses WHERE user_id = ?').run(user.id); return json({ ok: true }); }
      if (path === '/api/payment-methods' && method === 'GET') return json({ methods: paymentMethods(env) });
      const refundProof = path.match(/^\/api\/account\/orders\/([a-zA-Z0-9-]+)\/refund-proof$/);
      if (refundProof && ['GET', 'POST'].includes(method)) {
        const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(refundProof[1]);
        const order = row && JSON.parse(row.data);
        requireValue(order && !order.demo && [row.user_id, order.sellerId].includes(user.id), 'Order not found.', 404);
        if (method === 'GET') {
          const proof = db.prepare('SELECT * FROM refund_proofs WHERE order_id = ?').get(order.id);
          requireValue(proof, 'Proof not found.', 404);
          return new Response(proof.proof, { headers: { 'Content-Type': proof.mime, 'Content-Disposition': 'attachment; filename="refund-proof"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
        }
        requireValue(order.sellerId === user.id && order.refund?.status === 'required', 'Refund proof cannot be submitted now.', 409);
        const form = await request.formData(); const file = form.get('proof');
        requireValue(file?.size > 0 && file.size <= MAX_PROOF && typeof file.arrayBuffer === 'function', 'Upload proof up to 5 MB.');
        const bytes = Buffer.from(await file.arrayBuffer()); const mime = proofMime(bytes);
        requireValue(mime && mime === file.type, 'Choose a valid PNG, JPEG, WebP, or PDF.');
        transaction(db, () => {
          const latest = JSON.parse(db.prepare('SELECT data FROM orders WHERE id = ?').get(order.id).data);
          requireValue(latest.refund?.status === 'required', 'Refund changed. Refresh and retry.', 409);
          db.prepare('INSERT INTO refund_proofs VALUES (?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET proof = excluded.proof, mime = excluded.mime').run(order.id, bytes, mime);
        });
        return json({ ok: true });
      }
      const workflow = path.match(/^\/api\/account\/orders\/([a-zA-Z0-9-]+)\/action$/);
      if (workflow && method === 'PATCH') {
        const v = await body(request);
        const order = transaction(db, () => {
          const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(workflow[1]);
          const o = row && JSON.parse(row.data);
          requireValue(o && !o.demo && [row.user_id, o.sellerId].includes(user.id), 'Order not found.', 404);
          const seller = o.sellerId === user.id;
          const pr = db.prepare('SELECT data FROM payments WHERE order_id = ?').get(o.id);
          const payment = pr && JSON.parse(pr.data);
          const paid = payment?.status === 'confirmed';
          const reason = () => text(v.reason, 'reason', 1000);
          const guard = (condition) => requireValue(condition, 'Order changed or action is unavailable. Refresh and try again.', 409);
          switch (v.action) {
            case 'cancel_request': guard(!seller && !o.fulfillment && !o.cancellation && !o.refund); o.cancellation = { status: 'requested', reason: reason() }; break;
            case 'cancel_approve': guard(seller && o.cancellation?.status === 'requested' && !o.fulfillment && payment?.status !== 'pending_verification'); o.cancellation.status = 'approved'; if (paid) o.refund = { status: 'required', amount: o.amount }; break;
            case 'cancel_reject': guard(seller && o.cancellation?.status === 'requested'); o.cancellation = { ...o.cancellation, status: 'rejected', rejectionReason: reason() }; break;
            case 'return_request': guard(!seller && paid && o.fulfillment?.status === 'completed' && now() <= o.fulfillment.completedAt + 7 * 86400000 && !o.return); o.return = { status: 'requested', reason: reason() }; break;
            case 'return_approve': guard(seller && o.return?.status === 'requested'); o.return = { ...o.return, status: 'approved', instructions: text(v.instructions, 'return address and instructions', 2000) }; break;
            case 'return_reject': guard(seller && o.return?.status === 'requested'); o.return = { ...o.return, status: 'rejected', rejectionReason: reason() }; break;
            case 'return_ship': guard(!seller && o.return?.status === 'approved'); o.return = { ...o.return, status: 'shipped', carrier: text(v.carrier, 'carrier', 100), trackingNumber: text(v.trackingNumber, 'tracking number', 100) }; break;
            case 'return_receive': guard(seller && o.return?.status === 'shipped'); o.return.status = 'received'; o.refund = { status: 'required', amount: o.amount }; break;
            case 'refund_record': guard(seller && o.refund?.status === 'required' && db.prepare('SELECT order_id FROM refund_proofs WHERE order_id = ?').get(o.id)); o.refund = { ...o.refund, status: 'sent', reference: text(v.reference, 'refund reference', 100) }; break;
            case 'refund_confirm': guard(!seller && o.refund?.status === 'sent'); o.refund.status = 'completed'; break;
            default: requireValue(false, 'Unknown order action.');
          }
          o.timeline = [...(o.timeline || []), { action: v.action, actor: user.id, at: now() }];
          db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(o), o.id);
          paymentNotice(seller ? row.user_id : o.sellerId, o, { id: `${o.id}:${o.timeline.length}` }, v.action, 'Order update: ' + v.action.replaceAll('_', ' '), seller ? '/dashboard/payments' : '/dashboard/sales');
          return o;
        });
        return json({ order });
      }
      const fulfillment = path.match(/^\/api\/account\/orders\/([a-zA-Z0-9-]+)\/fulfillment$/);
      if (fulfillment && method === 'PATCH') {
        const v = await body(request);
        const updated = transaction(db, () => {
          const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(fulfillment[1]);
          const order = row && JSON.parse(row.data);
          requireValue(order && !order.demo && (row.user_id === user.id || order.sellerId === user.id), 'Order not found.', 404);
          const paymentRow = db.prepare('SELECT data FROM payments WHERE order_id = ?').get(order.id);
          requireValue(paymentRow && JSON.parse(paymentRow.data).status === 'confirmed', 'Payment must be confirmed first.', 409);
          if (v.action === 'ship') {
            requireValue(order.sellerId === user.id, 'Only the seller can ship this order.', 403);
            requireValue(!order.fulfillment && !['requested', 'approved'].includes(order.cancellation?.status) && !order.refund, 'Order cannot be shipped.', 409);
            order.fulfillment = { status: 'shipped', carrier: text(v.carrier, 'carrier', 100), trackingNumber: text(v.trackingNumber, 'tracking number', 100), shippedAt: now() };
          } else {
            requireValue(v.action === 'complete', 'Choose a valid order action.');
            requireValue(row.user_id === user.id, 'Only the buyer can confirm receipt.', 403);
            requireValue(order.fulfillment?.status === 'shipped', 'Order must be shipped before confirming receipt.', 409);
            order.fulfillment = { ...order.fulfillment, status: 'completed', completedAt: now() };
          }
          db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(order), order.id);
          paymentNotice(v.action === 'ship' ? row.user_id : order.sellerId, order, { id: order.id }, order.fulfillment.status, v.action === 'ship' ? 'Your order has shipped' : 'Buyer confirmed receipt — order completed', v.action === 'ship' ? '/dashboard/payments' : '/dashboard/sales');
          return order;
        });
        return json({ order: updated });
      }
      if (path === '/api/account/sales' && method === 'GET') {
        marketplace.finalize();
        const sales = db.prepare('SELECT orders.*, users.name AS buyer FROM orders JOIN users ON users.id = orders.user_id ORDER BY orders.rowid DESC').all().filter((r) => { const o = JSON.parse(r.data); return o.sellerId === user.id && !o.demo; }).map((r) => ({ ...JSON.parse(r.data), buyer: r.buyer, payment: (() => { const p = db.prepare('SELECT data FROM payments WHERE order_id = ?').get(r.id); return p ? JSON.parse(p.data) : null; })(), history: db.prepare('SELECT data FROM payment_history WHERE order_id = ?').all(r.id).map((p) => JSON.parse(p.data)) }));
        return json({ sales });
      }
      const review = path.match(/^\/api\/account\/sales\/([a-zA-Z0-9-]+)\/payment$/);
      if (review && method === 'PATCH') {
        const v = await body(request);
        const order = db.prepare('SELECT data FROM orders WHERE id = ?').get(review[1]);
        requireValue(order && JSON.parse(order.data).sellerId === user.id && !JSON.parse(order.data).demo, 'Order not found.', 404);
        requireValue(['confirmed', 'rejected'].includes(v.decision), 'Choose a payment decision.');
        const reason = v.decision === 'rejected' ? text(v.rejectionReason, 'rejection reason', 1000) : null;
        const payment = transaction(db, () => {
          const row = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(review[1]);
          requireValue(row && row.id === v.paymentId && JSON.parse(row.data).status === 'pending_verification', 'Payment changed. Refresh before reviewing.', 409);
          const updated = { ...JSON.parse(row.data), status: v.decision, reviewedAt: now(), reviewedBy: user.id, rejectionReason: reason };
          db.prepare('UPDATE payments SET data = ? WHERE id = ?').run(JSON.stringify(updated), row.id);
          paymentNotice(row.user_id, JSON.parse(order.data), updated, v.decision, v.decision === 'confirmed' ? 'Payment confirmed by seller' : 'Payment proof rejected: ' + reason, '/dashboard/payments');
          return updated;
        });
        return json({ payment });
      }
      if (path === '/api/account/orders' && method === 'GET') return json({ orders: ordersFor(user.id) });
      if (path === '/api/account/orders/demo' && method === 'POST') {
        const existing = db.prepare("SELECT data FROM orders WHERE user_id = ? AND auction_id IS NULL LIMIT 1").get(user.id);
        if (existing) return json({ order: JSON.parse(existing.data) });
        const order = { id: randomUUID(), title: 'Payment walkthrough — sample order', amount: 2500, demo: true, createdAt: now() };
        db.prepare('INSERT INTO orders VALUES (?, ?, NULL, ?)').run(order.id, user.id, JSON.stringify(order));
        return json({ order }, 201);
      }
      const orderMatch = path.match(/^\/api\/account\/orders\/([a-zA-Z0-9-]+)\/proof$/);
      if (orderMatch && method === 'POST') {
        rateLimit(`proof:${user.id}`, 20);
        const orderRow = db.prepare('SELECT data FROM orders WHERE id = ? AND user_id = ?').get(orderMatch[1], user.id);
        requireValue(orderRow, 'Order not found.', 404);
        const prior = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderMatch[1]);
        requireValue(!prior || JSON.parse(prior.data).status === 'rejected', 'Proof was already submitted for this order.', 409);
        requireValue(request.headers.get('content-type')?.startsWith('multipart/form-data'), 'Choose a screenshot or receipt file.', 415);
        let form; try { form = await request.formData(); } catch { throw new ApiError(400, 'Invalid file upload.'); }
        const order = JSON.parse(orderRow.data);
        requireValue(METHODS.some((m) => m.id === form.get('method')), 'Choose a supported payment method.');
        const methodInfo = (order.demo ? paymentMethods() : order.settlement?.methods || []).find((m) => m.id === form.get('method'));
        requireValue(methodInfo, 'The seller must provide payment details for this order before you can submit proof.', 409);
        requireValue(order.demo || (methodInfo.accountNumber || methodInfo.qrId), 'Payment details have not been configured for this method. Do not send funds.', 409);
        const reference = text(form.get('reference'), 'transaction reference', 100);
        const file = form.get('proof');
        requireValue(file && typeof file.arrayBuffer === 'function' && file.size > 0 && file.size <= MAX_PROOF, 'Upload a PNG, JPEG, WebP, or PDF file, up to 5 MB.');
        const bytes = Buffer.from(await file.arrayBuffer());
        const mime = proofMime(bytes);
        requireValue(mime && mime === file.type, 'The file must be a valid PNG, JPEG, WebP, or PDF with a matching file type.');
        const addressRow = db.prepare('SELECT data FROM addresses WHERE user_id = ?').get(user.id);
        requireValue(order.demo || addressRow, 'Save a shipping address before submitting payment proof.', 409);
        const payment = { id: randomUUID(), orderId: order.id, method: methodInfo.name, methodId: methodInfo.id, reference, status: 'pending_verification', submittedAt: now(), amount: order.amount, title: order.title, demo: order.demo, sellerSettlement: order.settlement || null, shippingAddress: addressRow ? JSON.parse(addressRow.data) : null };
        try { transaction(db, () => { const current = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(order.id); requireValue((current?.id || null) === (prior?.id || null) && (!current || JSON.parse(current.data).status === 'rejected'), 'Payment changed. Refresh and try again.', 409); if (current) { db.prepare('INSERT INTO payment_history SELECT * FROM payments WHERE id = ?').run(current.id); db.prepare('DELETE FROM payments WHERE id = ?').run(current.id); } db.prepare('INSERT INTO payments VALUES (?, ?, ?, ?, ?, ?, ?)').run(payment.id, order.id, user.id, JSON.stringify(payment), bytes, mime, String(file.name).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 100) || 'payment-proof'); }); }
        catch (error) { if (String(error.message).includes('UNIQUE')) throw new ApiError(409, 'Proof was already submitted for this order.'); throw error; }
        paymentNotice(order.sellerId, order, payment, 'proof_submitted', 'Buyer submitted payment proof', '/dashboard/sales');
        return json({ payment }, 201);
      }
      const paymentMatch = path.match(/^\/api\/account\/payments\/([a-zA-Z0-9-]+)\/(proof|receipt)$/);
      if (paymentMatch && method === 'GET') {
        const row = db.prepare('SELECT * FROM payments WHERE id = ? UNION ALL SELECT * FROM payment_history WHERE id = ?').get(paymentMatch[1], paymentMatch[1]);
        const owner = row && db.prepare('SELECT data FROM orders WHERE id = ?').get(row.order_id);
        requireValue(row && (row.user_id === user.id || (owner && JSON.parse(owner.data).sellerId === user.id)), 'Payment submission not found.', 404);
        requireValue(row, 'Payment submission not found.', 404);
        const p = JSON.parse(row.data);
        const proof = paymentMatch[2] === 'proof';
        const receipt = `BIDWAVE — PAYMENT SUBMISSION RECEIPT\n\n${p.demo ? 'DEMO ONLY — NO PAYMENT REQUIRED\n' : ''}Status: ${p.status.toUpperCase().replaceAll('_', ' ')}\nSubmission: ${p.id}\nOrder: ${p.orderId}\nItem: ${p.title}\nAmount: PHP ${p.amount.toLocaleString('en-PH')}\nMethod: ${p.method}\nReference: ${p.reference}\nSubmitted: ${new Date(p.submittedAt).toISOString()}\n\nThis acknowledges receipt of a file and reference number only.\nIt does NOT confirm that money has been received or settled.\n`;
        return new Response(proof ? row.proof : receipt, { headers: { 'Content-Type': proof ? row.mime : 'text/plain; charset=utf-8', 'Content-Disposition': `${proof && url.searchParams.get('preview') === '1' ? 'inline' : 'attachment'}; filename="${proof ? row.filename : `bidwave-submission-${p.id}.txt`}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      throw new ApiError(404, 'Endpoint not found.');
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('BidWave API error:', error.message);
      return json({ error: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.' }, error.status || 500);
    }
  }
  let worker;
  function start() { if (!worker) { worker = setInterval(() => { try { marketplace.finalize(); } catch (error) { console.error('Auction finalization failed:', error.message); } }, 30000); worker.unref(); } }
  function stop() { clearInterval(worker); worker = null; }
  return { handle, db, start, stop, finalize: marketplace.finalize };
}
