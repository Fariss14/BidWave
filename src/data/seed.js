export const createGuest = () => ({ id: `guest-${crypto.randomUUID()}`, name: 'Demo visitor', kind: 'guest' });
const camera = 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=900&q=80';
const headphones = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85';
const sneakers = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80';
export function createSeed(now = Date.now()) {
  return {
    version: 1,
    notifications: [],
    profile: null,
    guest: createGuest(),
    auctions: [{
      id: 'studio-headphones',
      location: { city: 'Manila', region: 'National Capital Region' }, example: true, increment: 1,
      title: 'Studio Wireless Headphones',
      category: 'electronics',
      image: headphones,
      description: 'Find your focus. Over-ear wireless headphones with soft ear cushions and a warm, balanced sound. Excellent demo condition; charging cable included.',
      startingPrice: 2000,
      currentBid: 2500,
      endsAt: now + 8310000,
      seller: {
        id: 'seed-maya',
        name: 'Maya'
      },
      bids: [{
        id: 'seed-bid-1',
        amount: 2500,
        bidder: 'Alex',
        at: now - 600000
      }]
    }, {
      id: 'vintage-camera',
      location: { city: 'Quezon City', region: 'National Capital Region' }, example: true, increment: 1,
      title: 'Vintage Camera',
      category: 'collectibles',
      image: camera,
      description: 'A classic camera for your collection or your next creative adventure. Includes the lens and original strap. Please inspect the photos before bidding.',
      startingPrice: 1500,
      currentBid: 1800,
      endsAt: now + 86400000,
      seller: {
        id: 'seed-luis',
        name: 'Luis'
      },
      bids: [{
        id: 'seed-bid-2',
        amount: 1800,
        bidder: 'Sam',
        at: now - 3600000
      }]
    }, {
      id: 'limited-sneakers',
      location: { city: 'Cebu City', province: 'Cebu', region: 'Central Visayas' }, example: true, increment: 1,
      title: 'Limited Sneakers',
      category: 'fashion',
      image: sneakers,
      description: 'A bold red pair made to stand out. Unworn, size EU 42, with the original box. A fresh addition to your everyday rotation.',
      startingPrice: 3200,
      currentBid: 3200,
      endsAt: now + 172800000,
      seller: {
        id: 'seed-ella',
        name: 'Ella'
      },
      bids: []
    }]
  };
}
