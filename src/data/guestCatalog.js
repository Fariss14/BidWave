import { createSeed } from './seed.js';
// Guest-only samples never enter the marketplace database.
export function guestCatalog(state, now = Date.now()) {
  const seeds = createSeed(now).auctions;
  const extras = [
    ['demo-speaker', 'Portable Bluetooth Speaker', 'electronics', 800, 'photo-1608043152269-423dbba4e7e1'],
    ['demo-keyboard', 'Mechanical Keyboard', 'electronics', 1200, 'photo-1587829741301-dc798b83add3'],
    ['demo-records', 'Vintage Vinyl Records', 'collectibles', 600, 'photo-1603048588665-791ca8aea617'],
    ['demo-watch', 'Classic Collector Watch', 'collectibles', 1800, 'photo-1524805444758-089113d48a6d'],
    ['demo-bag', 'Everyday Canvas Bag', 'fashion', 450, 'photo-1553062407-98eeb64c6a62'],
    ['demo-jacket', 'Classic Denim Jacket', 'fashion', 900, 'photo-1543076447-215ad9ba6923'],
  ].map(([id,title,category,startingPrice,photo], index) => ({ id, title, category, startingPrice, currentBid: startingPrice, increment: 1, image: `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=900&q=80`, description: `${title}. A simulated product for practicing bids. No purchase, payment, or delivery is required.`, example: true, location: { city: 'Manila', region: 'National Capital Region' }, seller: { id: 'seed-demo', name: 'Sample seller' }, bids: [], endsAt: now + (index + 1) * 86400000 }));
  return { ...state, auctions: [...seeds, ...extras].map((sample) => {
    const saved = state.auctions.find((a) => a.id === sample.id);
    return saved && saved.endsAt > now ? { ...saved, example: true } : sample;
  }) };
}
