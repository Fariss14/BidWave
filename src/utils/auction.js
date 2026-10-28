export const categories = ['electronics', 'collectibles', 'fashion'];
export const money = value => new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
}).format(value);
export function timeLeft(endsAt, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  if (!seconds) return 'Auction ended';
  const days = Math.floor(seconds / 86400);
  return `${days ? `${days}d ` : ''}${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
}
export function minimumBid(auction) {
  // No fixed increment and legacy auctions both require a strictly higher whole-peso bid.
  return auction.bids.length ? auction.currentBid + (auction.increment || 1) : auction.startingPrice;
}
export function bidError(auction, amount, profile, now = Date.now()) {
  if (!auction) return 'This auction could not be found.';
  if (!profile) return 'A bidder identity is required.';
  if (auction.seller.id === profile.id) return 'You cannot bid on your own auction.';
  if (auction.endsAt <= now) return 'This auction has ended.';
  if (!Number.isSafeInteger(amount) || amount < minimumBid(auction)) return `Enter a whole-peso bid of at least ${money(minimumBid(auction))}.`;
  return '';
}
export function selectAuctions(auctions, {
  search = '',
  category = '',
  sort = 'ending'
} = {}) {
  return auctions.filter(a => (!category || a.category === category) && `${a.title} ${a.description}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => sort === 'price-low' ? a.currentBid - b.currentBid : sort === 'price-high' ? b.currentBid - a.currentBid : a.endsAt - b.endsAt);
}
export function imageUrlValid(value) {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
