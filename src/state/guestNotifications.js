export function finalizeGuest(state, now = Date.now()) {
  const notifications = [...(state.notifications || [])];
  for (const a of state.auctions) {
    if (a.endsAt > now || !a.bids.some((b) => b.bidderId === state.guest.id)) continue;
    const id = `guest-result-${a.id}`;
    if (notifications.some((n) => n.id === id)) continue;
    const won = a.bids[0]?.bidderId === state.guest.id;
    notifications.unshift({ id, auctionId: a.id, title: won ? 'Demo result: you won!' : 'Demo result: another bidder won', body: a.title, type: won ? 'auction_won' : 'auction_lost', href: `/auctions/${a.id}`, createdAt: a.endsAt, readAt: null, demo: true });
  }
  return notifications.length === (state.notifications || []).length ? state : { ...state, notifications };
}
