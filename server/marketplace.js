import { randomUUID } from 'node:crypto';
import { asyncTransaction } from './database.js';
import { check, ApiError } from './errors.js';
import { readImage, putImage, imageResponse } from './media.js';
import { categories as builtins, imageUrlValid } from '../src/utils/auction.js';
import { coarseCoordinates, distanceKm, validCoordinates } from '../src/utils/location.js';
export const METHODS = [{
  id: 'gcash',
  name: 'GCash'
}, {
  id: 'maya',
  name: 'Maya'
}, {
  id: 'maribank',
  name: 'MariBank'
}, {
  id: 'bank',
  name: 'Bank account'
}];
const string = (value, label, max = 100) => {
  check(typeof value === 'string' && value.trim() && value.trim().length <= max, `Enter a valid ${label} (up to ${max} characters).`);
  return value.trim();
};
export function publicAuction(a) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.category,
    categoryName: a.categoryName || a.category,
    image: a.image,
    startingPrice: a.startingPrice,
    currentBid: a.currentBid,
    increment: a.increment ?? 1,
    endsAt: a.endsAt,
    revision: a.revision || 0,
    seller: {
      id: a.seller.id,
      name: a.seller.name
    },
    bids: a.bids.map(({
      id,
      amount,
      bidder,
      bidderId,
      at,
      demo
    }) => ({
      id,
      amount,
      bidder,
      bidderId,
      at,
      demo
    })),
    location: a.location ? {
      city: a.location.city,
      province: a.location.province,
      region: a.location.region
    } : null,
    hasDistance: !!a.location?.coordinates,
    example: a.seller.id.startsWith('seed-') || !!a.example,
    needsSettlement: !a.settlement
  };
}
export function createMarketplace({
  db,
  locations,
  now
}) {
  const all = async () => (await db.prepare('SELECT data FROM auctions').all()).map(r => JSON.parse(r.data));
  const userExists = async id => !!(await db.prepare('SELECT id FROM users WHERE id = ?').get(id));
  const settings = async id => {
    const row = await db.prepare('SELECT data FROM seller_settings WHERE user_id = ?').get(id);
    return row ? JSON.parse(row.data) : null;
  };
  async function notify(userId, auction, type, title, body, href, eventKey = type) {
    if (!(await userExists(userId))) return;
    const id = randomUUID();
    const data = {
      id,
      auctionId: auction.id,
      type,
      title,
      body,
      href,
      createdAt: now()
    };
    await db.prepare('INSERT OR IGNORE INTO notifications (id, user_id, auction_id, type, data) VALUES (?, ?, ?, ?, ?)').run(id, userId, auction.id, eventKey, JSON.stringify(data));
  }
  async function finalize() {
    await asyncTransaction(db, async () => {
      for (const a of await all()) {
        if (a.endsAt > now() || (await db.prepare('SELECT auction_id FROM finalized_auctions WHERE auction_id = ?').get(a.id))) continue;
        const winner = a.bids[0]?.bidderId;
        if (winner && (await userExists(winner))) {
          const id = randomUUID();
          const order = {
            id,
            auctionId: a.id,
            sellerId: a.seller.id,
            title: a.title,
            amount: a.currentBid,
            demo: a.seller.id.startsWith('seed-') || !!a.example,
            createdAt: a.endsAt,
            location: publicAuction(a).location,
            settlement: a.settlement || null
          };
          await db.prepare('INSERT OR IGNORE INTO orders VALUES (?, ?, ?, ?)').run(id, winner, a.id, JSON.stringify(order));
        }
        for (const participant of new Set(a.bids.map(b => b.bidderId).filter(Boolean))) {
          const won = participant === winner;
          await notify(participant, a, won ? 'auction_won' : 'auction_lost', won ? 'You won an auction!' : 'Auction result: another bidder won', a.title, won ? '/dashboard/payments' : `/auctions/${a.id}`);
        }
        await notify(a.seller.id, a, winner ? 'auction_sold' : 'auction_ended', winner ? 'Your auction has a winner' : 'Your auction ended without bids', a.title, '/dashboard/listings');
        await db.prepare('INSERT INTO finalized_auctions VALUES (?, ?)').run(a.id, now());
      }
    });
  }
  async function completeLegacy(userId, settlement) {
    for (const a of await all()) {
      if (a.seller.id !== userId || a.settlement) continue;
      const orders = await db.prepare('SELECT * FROM orders WHERE auction_id = ?').all(a.id);
      if (await db.prepare('SELECT id FROM payments WHERE order_id IN (SELECT id FROM orders WHERE auction_id = ?) LIMIT 1').get(a.id)) continue;
      a.settlement = settlement;
      await db.prepare('UPDATE auctions SET data = ? WHERE id = ?').run(JSON.stringify(a), a.id);
      for (const order of orders) {
        const data = {
          ...JSON.parse(order.data),
          sellerId: userId,
          settlement
        };
        await db.prepare('UPDATE orders SET data = ? WHERE id = ?').run(JSON.stringify(data), order.id);
      }
    }
  }
  async function location(values) {
    if (values.mode === 'manual') return {
      mode: 'manual',
      city: string(values.city, 'item city'),
      region: string(values.region, 'item region'),
      province: typeof values.province === 'string' ? values.province.trim().slice(0, 100) : '',
      barangay: string(values.barangay, 'item barangay'),
      coordinates: coarseCoordinates(values.coordinates)
    };
    const city = (await locations.cities()).find(c => c.code === values.cityCode);
    const barangay = city && (await locations.barangays(city.code)).find(b => b.code === values.barangayCode);
    check(city && barangay, 'Choose a valid city and barangay.');
    return {
      city: city.name,
      cityCode: city.code,
      region: city.region.name,
      province: city.province?.name || '',
      barangay: barangay.name,
      barangayCode: barangay.code,
      coordinates: coarseCoordinates(values.coordinates)
    };
  }
  async function payload(request) {
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      let form;
      try {
        form = await request.formData();
      } catch {
        throw new ApiError(400, 'Invalid upload.');
      }
      let values;
      try {
        values = JSON.parse(form.get('metadata'));
      } catch {
        throw new ApiError(400, 'Invalid listing or settings data.');
      }
      check(values && typeof values === 'object' && !Array.isArray(values), 'Send valid form data.');
      return {
        values,
        form
      };
    }
    check(request.headers.get('content-type')?.startsWith('application/json'), 'Send form data or JSON.', 415);
    let values;
    try {
      values = await request.json();
    } catch {
      throw new ApiError(400, 'Invalid JSON.');
    }
    check(values && typeof values === 'object' && !Array.isArray(values), 'Send a JSON object.');
    return {
      values,
      form: null
    };
  }
  async function handle(request, user, url) {
    const path = url.pathname.replace(/\/$/, '');
    const method = request.method;
    const json = (data, status = 200) => Response.json(data, {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
    if (path === '/api/categories' && method === 'GET') return json({
      categories: await db.prepare('SELECT id, name FROM categories ORDER BY rowid').all()
    });
    const media = path.match(/^\/api\/media\/([a-zA-Z0-9-]+)$/);
    if (media && method === 'GET') {
      const row = await db.prepare('SELECT * FROM media WHERE id = ?').get(media[1]);
      check(row && (row.kind === 'product' || row.owner_id === user?.id), 'Image not found.', 404);
      return imageResponse(row, row.kind !== 'product');
    }
    if (!user) return null;
    if (path === '/api/account/seller' && method === 'GET') return json({
      settings: await settings(user.id),
      methods: METHODS
    });
    if (path === '/api/account/seller' && method === 'PUT') {
      const {
        values: v,
        form
      } = await payload(request);
      const name = string(v.contactName, 'contact name');
      const phone = string(v.phone, 'contact phone', 30);
      check(/^[+\d\s()-]{7,30}$/.test(phone) && phone.replace(/\D/g, '').length >= 7 && phone.replace(/\D/g, '').length <= 15, 'Enter a valid contact phone number.');
      const link = v.link ? string(v.link, 'messaging/profile link', 500) : '';
      check(!link || imageUrlValid(link), 'Use an HTTP(S) messaging or profile link.');
      check(Array.isArray(v.methods) && v.methods.length > 0 && v.methods.length <= 4, 'Add at least one payment account or QR code.');
      const previous = await settings(user.id);
      const ids = new Set();
      const images = [];
      const methods = [];
      for (const m of v.methods) {
        const kind = METHODS.find(item => item.id === m.id);
        check(kind && !ids.has(m.id), 'Choose each supported payment method only once.');
        ids.add(m.id);
        const accountName = string(m.accountName, 'account holder name');
        const accountNumber = m.accountNumber ? string(m.accountNumber, 'account number', 100) : '';
        const bankName = kind.id === 'bank' ? string(m.bankName, 'bank name') : kind.name;
        const upload = form?.get(`qr_${m.id}`);
        let qrId = null;
        if (upload?.size) {
          const image = await readImage(upload, 'QR image');
          images.push(image);
          qrId = image.id;
        } else if (m.qrId && previous?.methods.some(old => old.id === m.id && old.qrId === m.qrId)) qrId = m.qrId;
        check(accountNumber || qrId, 'Each method needs an account number or QR image.');
        methods.push({
          id: m.id,
          name: kind.name,
          accountName,
          accountNumber,
          bankName,
          qrId,
          configured: true
        });
      }
      const saved = {
        contactName: name,
        phone,
        link,
        methods
      };
      await asyncTransaction(db, async () => {
        for (const image of images) await putImage(db, user.id, 'qr', image);
        await db.prepare('INSERT INTO seller_settings VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').run(user.id, JSON.stringify(saved));
        await completeLegacy(user.id, saved);
      });
      return json({
        settings: saved
      });
    }
    if (path === '/api/auctions' && method === 'POST') {
      const {
        values: v,
        form
      } = await payload(request);
      const title = string(v.title, 'title', 100);
      const description = string(v.description, 'description', 2000);
      check(Number.isSafeInteger(v.startingPrice) && v.startingPrice > 0, 'Enter a positive whole-peso starting price.');
      check(Number.isSafeInteger(v.increment) && v.increment >= 0, 'Enter a whole-peso increment or choose no increment.');
      const preset = [1, 3, 7].includes(v.duration);
      check(preset ? v.endsAt === undefined : v.duration === 'custom' && Number.isSafeInteger(v.endsAt), 'Choose a preset duration or a custom deadline.');
      const endsAt = preset ? now() + v.duration * 86400000 : v.endsAt;
      check(endsAt >= now() + 300000 && endsAt <= now() + 30 * 86400000, 'The deadline must be between 5 minutes and 30 days from now.');
      const settlement = await settings(user.id);
      check(settlement, 'Set up seller contact and payment details before publishing.', 409);
      const pickup = await location(v.location || {});
      const upload = form?.get('image');
      const image = upload?.size ? await readImage(upload, 'product image') : null;
      check(image || typeof v.image === 'string' && v.image.length <= 2048 && imageUrlValid(v.image), 'Choose a product photo or enter a valid image URL.');
      const normalized = v.customCategory ? string(v.customCategory, 'custom category', 50).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ') : null;
      check(!normalized || normalized.length >= 2, 'A custom category needs at least two characters.');
      check(normalized || (await db.prepare('SELECT id FROM categories WHERE id = ?').get(v.category)), 'Choose a valid category.');
      const auction = await asyncTransaction(db, async () => {
        let category = normalized ? await db.prepare('SELECT id, name FROM categories WHERE normalized = ?').get(normalized) : await db.prepare('SELECT id, name FROM categories WHERE id = ?').get(v.category);
        if (!category) {
          category = {
            id: randomUUID(),
            name: v.customCategory.trim().replace(/\s+/g, ' ')
          };
          await db.prepare('INSERT INTO categories VALUES (?, ?, ?)').run(category.id, category.name, normalized);
        }
        if (image) await putImage(db, user.id, 'product', image);
        const a = {
          id: randomUUID(),
          title,
          description,
          category: category.id,
          categoryName: category.name,
          image: image ? `/api/media/${image.id}` : v.image.trim(),
          startingPrice: v.startingPrice,
          currentBid: v.startingPrice,
          increment: v.increment,
          endsAt,
          location: pickup,
          settlement,
          seller: {
            id: user.id,
            name: user.name
          },
          bids: []
        };
        await db.prepare('INSERT INTO auctions VALUES (?, ?)').run(a.id, JSON.stringify(a));
        return a;
      });
      return json({
        auction: publicAuction(auction)
      }, 201);
    }
    const editor = path.match(/^\/api\/account\/listings\/([a-zA-Z0-9-]+)$/);
    if (editor && method === 'GET') {
      const row = await db.prepare('SELECT data FROM auctions WHERE id = ?').get(editor[1]);
      const a = row && JSON.parse(row.data);
      check(a && a.seller.id === user.id, 'Listing not found.', 404);
      const ended = a.endsAt <= now() || !!(await db.prepare('SELECT auction_id FROM finalized_auctions WHERE auction_id = ?').get(a.id)) || !!(await db.prepare('SELECT id FROM orders WHERE auction_id = ?').get(a.id));
      return json({
        auction: {
          ...publicAuction(a),
          location: a.location || null
        },
        editable: !ended,
        hasBids: a.bids.length > 0,
        serverTime: now()
      });
    }
    const edit = path.match(/^\/api\/auctions\/([a-zA-Z0-9-]+)$/);
    if (edit && method === 'PATCH') {
      const row = await db.prepare('SELECT data FROM auctions WHERE id = ?').get(edit[1]);
      const initial = row && JSON.parse(row.data);
      check(initial && initial.seller.id === user.id, 'Listing not found.', 404);
      const {
        values: v,
        form
      } = await payload(request);
      const keys = ['revision', 'endsAt', 'title', 'description', 'startingPrice', 'increment', 'category', 'customCategory', 'location', 'image'];
      check(Object.keys(v).every(key => keys.includes(key)), 'This update contains unsupported listing fields.');
      check(Number.isSafeInteger(v.revision) && v.revision >= 0, 'Reload the listing before saving.');
      check(Number.isSafeInteger(v.endsAt), 'Choose a valid end date and time.');
      const changes = {};
      if (v.title !== undefined) changes.title = string(v.title, 'title', 100);
      if (v.description !== undefined) changes.description = string(v.description, 'description', 2000);
      for (const key of ['startingPrice', 'increment']) if (v[key] !== undefined) {
        check(Number.isSafeInteger(v[key]) && v[key] >= (key === 'increment' ? 0 : 1), 'Starting price must be positive and increment cannot be negative.');
        changes[key] = v[key];
      }
      if (v.location !== undefined) changes.location = await location(v.location);
      const upload = form?.get('image');
      const image = upload?.size ? await readImage(upload, 'product image') : null;
      if (v.image !== undefined) {
        check(typeof v.image === 'string' && v.image.length <= 2048 && imageUrlValid(v.image), 'Enter a valid HTTP(S) image URL.');
        changes.image = v.image.trim();
      }
      check(!(image && v.image !== undefined), 'Choose either a replacement photo or an image URL.');
      const normalized = v.customCategory ? string(v.customCategory, 'custom category', 50).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ') : null;
      check(!normalized || normalized.length >= 2, 'A custom category needs at least two characters.');
      check(v.category === undefined || normalized || (await db.prepare('SELECT id FROM categories WHERE id = ?').get(v.category)), 'Choose a valid category.');
      const auction = await asyncTransaction(db, async () => {
        // Re-read after async location/image validation: bids or finalization may have happened.
        const current = JSON.parse((await db.prepare('SELECT data FROM auctions WHERE id = ?').get(edit[1])).data);
        check(current.seller.id === user.id, 'Listing not found.', 404);
        check(current.endsAt > now() && !(await db.prepare('SELECT auction_id FROM finalized_auctions WHERE auction_id = ?').get(current.id)) && !(await db.prepare('SELECT id FROM orders WHERE auction_id = ?').get(current.id)), 'Ended or settled auctions cannot be edited. Create a new listing instead.', 409);
        check((current.revision || 0) === v.revision, 'The listing changed while you were editing. Reload it and review the latest bids before saving.', 409);
        if (v.endsAt !== current.endsAt) check(v.endsAt >= now() + 300000 && v.endsAt <= now() + 30 * 86400000, 'The new deadline must be between 5 minutes and 30 days from now.');
        if (current.bids.length) {
          check(v.startingPrice === undefined && v.increment === undefined, 'Once bids exist, starting price and increment cannot be changed.', 409);
          check(v.endsAt >= current.endsAt, 'Once bids exist, the deadline can be extended but cannot be shortened.', 409);
        }
        let category;
        if (normalized || v.category !== undefined) {
          category = normalized ? await db.prepare('SELECT id, name FROM categories WHERE normalized = ?').get(normalized) : await db.prepare('SELECT id, name FROM categories WHERE id = ?').get(v.category);
          if (!category) {
            category = {
              id: randomUUID(),
              name: v.customCategory.trim().replace(/\s+/g, ' ')
            };
            await db.prepare('INSERT INTO categories VALUES (?, ?, ?)').run(category.id, category.name, normalized);
          }
        }
        if (image) {
          await putImage(db, user.id, 'product', image);
          changes.image = `/api/media/${image.id}`;
        }
        const updated = {
          ...current,
          ...changes,
          ...(category ? {
            category: category.id,
            categoryName: category.name
          } : {}),
          currentBid: current.bids.length ? current.currentBid : changes.startingPrice ?? current.startingPrice,
          endsAt: v.endsAt,
          revision: (current.revision || 0) + 1,
          updatedAt: now()
        };
        await db.prepare('UPDATE auctions SET data = ? WHERE id = ?').run(JSON.stringify(updated), current.id);
        if (updated.endsAt !== current.endsAt) {
          const formatted = new Date(updated.endsAt).toLocaleString('en-PH', {
            timeZone: 'Asia/Manila',
            timeZoneName: 'short'
          });
          for (const bidder of new Set(current.bids.map(bid => bid.bidderId).filter(Boolean))) await notify(bidder, updated, 'deadline_changed', 'Auction deadline updated', `${updated.title} now ends ${formatted}.`, `/auctions/${updated.id}`, `deadline_changed:${updated.revision}`);
        }
        const detailsChanged = image || Object.keys(changes).some(key => JSON.stringify(changes[key]) !== JSON.stringify(current[key])) || category && category.id !== current.category;
        if (detailsChanged) {
          for (const bidder of new Set(current.bids.map(bid => bid.bidderId).filter(Boolean))) await notify(bidder, updated, 'listing_changed', 'Auction listing updated', `The seller updated ${updated.title}. Review the latest item details.`, `/auctions/${updated.id}`, `listing_changed:${updated.revision}`);
        }
        return updated;
      });
      return json({
        auction: publicAuction(auction)
      });
    }
    const distance = path.match(/^\/api\/auctions\/([a-zA-Z0-9-]+)\/distance$/);
    if (distance && method === 'POST') {
      const {
        values
      } = await payload(request);
      check(validCoordinates(values), 'Provide a valid device location.');
      const row = await db.prepare('SELECT data FROM auctions WHERE id = ?').get(distance[1]);
      check(row, 'Auction not found.', 404);
      return json({
        distanceKm: distanceKm(values, JSON.parse(row.data).location?.coordinates),
        approximate: true
      });
    }
    if (path === '/api/account/notifications' && method === 'GET') {
      await finalize();
      return json({
        notifications: (await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY rowid DESC').all(user.id)).map(r => ({
          ...JSON.parse(r.data),
          readAt: r.read_at
        }))
      });
    }
    if (path === '/api/account/notifications/read-all' && method === 'POST') {
      await db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), user.id);
      return json({
        ok: true
      });
    }
    const notification = path.match(/^\/api\/account\/notifications\/([a-zA-Z0-9-]+)$/);
    if (notification && method === 'PATCH') {
      const {
        values
      } = await payload(request);
      check(typeof values.read === 'boolean', 'Choose read or unread.');
      const result = await db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?').run(values.read ? now() : null, notification[1], user.id);
      check(result.changes, 'Notification not found.', 404);
      return json({
        ok: true
      });
    }
    const order = path.match(/^\/api\/account\/orders\/([a-zA-Z0-9-]+)\/(settlement|qr\/([a-z]+))$/);
    if (order && method === 'GET') {
      const row = await db.prepare('SELECT data FROM orders WHERE id = ? AND user_id = ?').get(order[1], user.id);
      check(row, 'Order not found.', 404);
      const data = JSON.parse(row.data);
      if (order[2] === 'settlement') return json({
        settlement: data.settlement || null
      });
      const qrId = data.settlement?.methods.find(m => m.id === order[3])?.qrId;
      const qr = qrId && (await db.prepare('SELECT * FROM media WHERE id = ? AND kind = ?').get(qrId, 'qr'));
      check(qr, 'QR image not found.', 404);
      return imageResponse(qr, true);
    }
    return null;
  }
  const ready = initialize();
  async function initialize() {
    for (const id of builtins) await db.prepare('INSERT OR IGNORE INTO categories VALUES (?, ?, ?)').run(id, id[0].toUpperCase() + id.slice(1), id);
    await finalize();
  }
  return {
    handle,
    finalize,
    settings,
    ready
  };
}
