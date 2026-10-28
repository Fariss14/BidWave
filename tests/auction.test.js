import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bidError, selectAuctions, timeLeft, imageUrlValid } from '../src/utils/auction.js';
import { applyBid } from '../src/state/actions.js';
import { createSeed } from '../src/data/seed.js';
import { loadState, saveState, STORAGE_KEY } from '../src/state/storage.js';
const now = 100000000;
const profile = {
  id: 'visitor',
  name: 'Visitor'
};
test('bids require an identity and a higher, safe whole-peso amount', () => {
  const a = createSeed(now).auctions[0];
  assert.match(bidError(a, 2600, null, now), /identity/);
  for (const amount of [0, -1, 2500, 2500.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.ok(bidError(a, amount, profile, now));
  assert.equal(bidError(a, 2501, profile, now), '');
  assert.match(bidError(a, 2600, a.seller, now), /own auction/);
  assert.match(bidError(undefined, 2600, profile, now), /not be found/);
});
test('expiry is checked at submission including exact deadline', () => {
  const a = createSeed(now).auctions[0];
  assert.equal(bidError(a, 2600, profile, a.endsAt - 1), '');
  assert.match(bidError(a, 2600, profile, a.endsAt), /ended/);
  assert.equal(timeLeft(a.endsAt, a.endsAt + 999), 'Auction ended');
  assert.equal(timeLeft(a.endsAt, a.endsAt - 1), '0h 0m 1s');
  assert.equal(timeLeft(now + 90061000, now), '1d 1h 1m 1s');
});
test('search, category and sorting compose without mutating source', () => {
  const {
    auctions
  } = createSeed(now);
  const ids = auctions.map(a => a.id);
  assert.equal(selectAuctions(auctions, {
    search: '  CAMERA  '
  })[0].id, 'vintage-camera');
  assert.equal(selectAuctions(auctions, {
    search: 'lens',
    category: 'collectibles'
  }).length, 1);
  assert.equal(selectAuctions(auctions, {
    search: 'camera',
    category: 'fashion'
  }).length, 0);
  assert.equal(selectAuctions(auctions, {
    sort: 'price-low'
  })[0].currentBid, 1800);
  assert.equal(selectAuctions(auctions, {
    sort: 'price-high'
  })[0].currentBid, 3200);
  assert.equal(selectAuctions(auctions)[0].id, 'studio-headphones');
  assert.deepEqual(auctions.map(a => a.id), ids);
});
test('image URLs allow only absolute HTTP(S)', () => {
  for (const url of ['javascript:alert(1)', 'data:image/png;base64,AA', '/image.png', 'invalid']) assert.equal(imageUrlValid(url), false);
  assert.equal(imageUrlValid('https://example.com/item.jpg'), true);
});
test('saved deadlines and profile survive round trip', () => {
  let saved;
  const storage = {
    getItem: key => key === STORAGE_KEY ? saved : null,
    setItem: (key, value) => {
      assert.equal(key, STORAGE_KEY);
      saved = value;
    }
  };
  assert.equal(loadState(storage).state.auctions.length, 3);
  const state = createSeed(now);
  state.profile = profile;
  assert.equal(saveState(storage, state), '');
  assert.deepEqual(loadState(storage), {
    state,
    warning: ''
  });
});
test('malformed, obsolete and unavailable storage recover without crashing', () => {
  const invalid = ['{', '{}', JSON.stringify({
    ...createSeed(now),
    version: 99
  }), JSON.stringify({
    ...createSeed(now),
    auctions: [{}]
  })];
  for (const raw of invalid) {
    const loaded = loadState({
      getItem: () => raw
    });
    assert.ok(loaded.warning);
    assert.equal(loaded.state.auctions.length, 3);
  }
  const unavailable = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('quota');
    }
  };
  assert.ok(loadState(unavailable).warning);
  assert.ok(saveState(unavailable, createSeed(now)));
});
test('bidding updates price and history atomically, rejecting stale repeat amounts', () => {
  const original = {
    ...createSeed(now),
    profile
  };
  const result = applyBid(original, 'studio-headphones', 2700, now, 'new-bid');
  assert.equal(result.error, '');
  const updated = result.state.auctions[0];
  assert.equal(updated.currentBid, 2700);
  assert.deepEqual(updated.bids[0], {
    id: 'new-bid',
    amount: 2700,
    bidder: 'Visitor',
    bidderId: profile.id,
    demo: false,
    at: now
  });
  assert.equal(updated.bids.length, original.auctions[0].bids.length + 1);
  assert.equal(original.auctions[0].currentBid, 2500);
  const rejected = applyBid(result.state, updated.id, 2700, now, 'repeat');
  assert.ok(rejected.error);
  assert.equal(rejected.state, result.state);
});
test('out-of-range saved timestamps are recovered before date rendering', () => {
  const state = createSeed(now);
  state.auctions[0].bids[0].at = 1e100;
  assert.ok(loadState({ getItem: () => JSON.stringify(state) }).warning);
});

test('visitors bid without creating an account and keep a stable guest identity', () => {
  const initial = createSeed(now);
  const first = applyBid(initial, 'studio-headphones', 2600, now, 'guest-first');
  assert.equal(first.error, '');
  assert.equal(first.state.profile, null);
  assert.equal(first.state.auctions[0].bids[0].bidderId, initial.guest.id);
  assert.equal(first.state.auctions[0].bids[0].demo, true);
  const second = applyBid(first.state, 'studio-headphones', 2700, now, 'guest-second');
  assert.equal(second.state.auctions[0].bids[0].bidderId, initial.guest.id);
});

test('minimum increments allow the starting price and larger non-multiple increases', async () => {
  const { minimumBid } = await import('../src/utils/auction.js');
  const a = { ...createSeed(now).auctions[0], startingPrice: 1000, currentBid: 1000, increment: 100, bids: [] };
  assert.equal(minimumBid(a), 1000); assert.equal(bidError(a, 1000, profile, now), '');
  a.bids = [{ amount: 1000 }];
  assert.ok(bidError(a, 1099, profile, now)); assert.equal(bidError(a, 1100, profile, now), ''); assert.equal(bidError(a, 1177, profile, now), '');
});
test('guest win/loss results persist and are generated once', async () => {
  const { finalizeGuest } = await import('../src/state/guestNotifications.js');
  const state = createSeed(now); const a = state.auctions[0]; a.endsAt = now;
  a.bids.unshift({ id: 'guest-bid', bidderId: state.guest.id, bidder: state.guest.name, at: now - 1, amount: 2600 });
  const result = finalizeGuest(state, now); assert.equal(result.notifications[0].type, 'auction_won'); assert.equal(result.notifications.length, 1);
  assert.equal(finalizeGuest(result, now + 1000), result);
  a.bids.unshift({ id: 'other', bidderId: 'other', bidder: 'Other', at: now, amount: 2700 });
  assert.equal(finalizeGuest(state, now).notifications[0].type, 'auction_lost');
  let raw; saveState({ setItem: (_, value) => { raw = value; } }, result);
  assert.equal(loadState({ getItem: () => raw }).state.notifications.length, 1);
});
test('distance calculations round seller locations and reject invalid coordinates', async () => {
  const { coarseCoordinates, distanceKm } = await import('../src/utils/location.js');
  assert.deepEqual(coarseCoordinates({ latitude: 14.604321, longitude: 121.047891 }), { latitude: 14.6, longitude: 121.05 });
  assert.equal(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }), 111);
  assert.equal(distanceKm({ latitude: 100, longitude: 0 }, { latitude: 0, longitude: 1 }), null);
});

test('local deadline inputs preserve the intended date and minute across time zones', async () => {
  const { localDeadline } = await import('../src/utils/datetime.js');
  const timestamp = new Date('2026-11-15T13:45:38.425Z').getTime();
  const input = localDeadline(timestamp);
  assert.match(input, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.equal(new Date(input).getTime(), timestamp - 38425);
});

test('guest catalog has three active samples per category and preserves practice bids', async () => {
  const { guestCatalog } = await import('../src/data/guestCatalog.js');
  const now = Date.now();
  const catalog = guestCatalog(createSeed(now), now);
  for (const category of ['electronics', 'collectibles', 'fashion']) assert.equal(catalog.auctions.filter((a) => a.category === category && a.endsAt > now).length, 3);
  assert.ok(catalog.auctions.every((a) => a.example));
  const item = catalog.auctions[0];
  const updated = applyBid(catalog, item.id, item.currentBid + 1, now);
  assert.equal(updated.error, '');
  assert.equal(guestCatalog(updated.state, now).auctions[0].currentBid, item.currentBid + 1);
  const refreshed = guestCatalog(catalog, now + 10 * 86400000);
  assert.equal(refreshed.auctions.filter((a) => a.endsAt > now + 10 * 86400000).length, 9);
});
