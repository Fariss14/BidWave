import { createGuest } from '../data/seed.js';
import { bidError } from '../utils/auction.js';

// Evaluate against the latest state, so rapid submissions cannot use an old price.
export function applyBid(state, id, amount, now = Date.now(), bidId = crypto.randomUUID()) {
  const auction = state.auctions.find(item => item.id === id);
  const actor = state.profile || state.guest || createGuest();
  const error = bidError(auction, amount, actor, now);
  if (error) return {
    state,
    error
  };
  const bid = {
    id: bidId,
    amount,
    bidder: actor.name,
    bidderId: actor.id,
    demo: actor.kind === 'guest',
    at: now
  };
  return {
    state: {
      ...state,
      guest: state.guest || (actor.kind === 'guest' ? actor : createGuest()),
      auctions: state.auctions.map(item => item.id === id ? {
        ...item,
        currentBid: amount,
        bids: [bid, ...item.bids]
      } : item)
    },
    error: ''
  };
}
