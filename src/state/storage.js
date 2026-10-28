import { categories } from '../utils/auction.js';
import { createGuest, createSeed } from '../data/seed.js';
export const STORAGE_KEY = 'bidwave-demo-v1';
const validTimestamp = value => Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000000;
const validProfile = p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim().length > 0;
export function isValidState(s) {
  return s?.version === 1 && (s.profile === null || validProfile(s.profile)) && (s.guest === undefined || validProfile(s.guest)) && (s.notifications === undefined || (Array.isArray(s.notifications) && s.notifications.every(n => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string' && typeof n.href === 'string' && n.href.startsWith('/auctions/') && validTimestamp(n.createdAt) && (n.readAt === null || validTimestamp(n.readAt))))) && Array.isArray(s.auctions) && s.auctions.every(a => (a.increment === undefined || (Number.isSafeInteger(a.increment) && a.increment >= 0)) && typeof a.id === 'string' && typeof a.title === 'string' && typeof a.description === 'string' && typeof a.image === 'string' && categories.includes(a.category) && validProfile(a.seller) && Number.isSafeInteger(a.startingPrice) && a.startingPrice > 0 && Number.isSafeInteger(a.currentBid) && a.currentBid >= a.startingPrice && validTimestamp(a.endsAt) && Array.isArray(a.bids) && a.bids.every(b => typeof b.id === 'string' && typeof b.bidder === 'string' && Number.isSafeInteger(b.amount) && validTimestamp(b.at)));
}
export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {
      state: createSeed(),
      warning: ''
    };
    const state = JSON.parse(raw);
    if (!isValidState(state)) throw new Error('Invalid demo data');
    return {
      state: { ...state, guest: state.guest || createGuest() },
      warning: ''
    };
  } catch {
    return {
      state: createSeed(),
      warning: 'Saved demo data could not be loaded. A fresh demo is available; changes may only last for this visit.'
    };
  }
}
export function saveState(storage, state) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return '';
  } catch {
    return 'Your browser could not save this demo. Changes will only last for this visit.';
  }
}
