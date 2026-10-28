import { guestCatalog } from '../data/guestCatalog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DemoContext } from './context';
import { loadState, saveState } from './storage';
import { applyBid } from './actions';
import { api } from './api';
import { finalizeGuest } from './guestNotifications';
import { categories as defaults } from '../utils/auction';

export default function DemoProvider({ children }) {
  const [loaded] = useState(() => loadState({ getItem: (key) => window.localStorage.getItem(key) }));
  const [demoState, setDemoState] = useState(() => guestCatalog(finalizeGuest({ ...loaded.state, profile: null })));
  const currentDemo = useRef(demoState);
  const [categories, setCategories] = useState(defaults.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })));
  const [accountNotifications, setAccountNotifications] = useState([]);
  const [notificationError, setNotificationError] = useState('');
  const [profile, setProfile] = useState(null);
  const [accountAuctions, setAccountAuctions] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const [warning, setWarning] = useState(loaded.warning);
  const [accountWarning, setAccountWarning] = useState('');
  // Invalidate in-flight account reads whenever the authenticated identity changes.
  const generation = useRef(0);
  const refreshAuctions = useCallback(async () => {
    const version = generation.current;
    const result = await api('/auctions');
    if (version === generation.current) setAccountAuctions(result.auctions);
  }, []);

  const refreshNotifications = useCallback(async () => {
    const version = generation.current;
    const data = await api('/account/notifications');
    if (version === generation.current) { setAccountNotifications(data.notifications); setNotificationError(''); }
  }, []);
  useEffect(() => { api('/categories').then((data) => setCategories(data.categories)).catch(() => {}); }, []);
  useEffect(() => {
    if (profile) return;
    const tick = () => { const next = finalizeGuest(currentDemo.current); if (next !== currentDemo.current) { currentDemo.current = next; setDemoState(next); } };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const result = await api('/session');
        if (cancelled) return;
        if (result.user) {
          setProfile(result.user);
          const data = await api('/auctions');
          if (cancelled) return;
          setAccountAuctions(data.auctions);
        }
      } catch (error) { if (!cancelled) setAccountWarning(error.message); }
      finally { if (!cancelled) setAuthReady(true); }
    }
    restore();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    function expired() { generation.current += 1; setProfile(null); setAccountAuctions([]); setAccountNotifications([]); setAccountWarning('Your session has expired. Please sign in again. Guest demo bidding is still available.'); }
    window.addEventListener('bidwave-session-expired', expired);
    return () => window.removeEventListener('bidwave-session-expired', expired);
  }, []);
  useEffect(() => {
    const message = saveState({ setItem: (key, value) => window.localStorage.setItem(key, value) }, demoState);
    if (message) queueMicrotask(() => setWarning(message));
  }, [demoState]);
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    const refresh = () => { refreshNotifications().catch((error) => { if (!cancelled) setNotificationError(error.message); }); return refreshAuctions().then(() => { if (!cancelled) setAccountWarning(''); }).catch((error) => { if (!cancelled) setAccountWarning(error.message); }); };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [profile, refreshAuctions, refreshNotifications]);

  async function authenticate(mode, values) {
    const result = await api(`/auth/${mode}`, { method: 'POST', body: values });
    generation.current += 1;
    setAccountWarning('');
    // Authentication is successful even if the subsequent auction refresh fails.
    try { await refreshAuctions(); } catch (error) { setAccountWarning(error.message); }
    setProfile(result.user);
    return result.user;
  }
  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
      generation.current += 1;
      setProfile(null); setAccountAuctions([]); setAccountNotifications([]); setAccountWarning('');
      return true;
    } catch (error) { setAccountWarning(error.message); return false; }
  }
  async function updateAccount(name) {
    const result = await api('/account', { method: 'PATCH', body: { name } });
    setProfile(result.user);
  }
  async function placeBid(id, amount) {
    if (profile) {
      try {
        const result = await api(`/auctions/${id}/bids`, { method: 'POST', body: { amount } });
        setAccountAuctions((items) => items.map((item) => item.id === id ? result.auction : item));
        return '';
      } catch (error) {
        if (error.status === 409) await refreshAuctions().catch(() => {});
        return error.message;
      }
    }
    const result = applyBid(currentDemo.current, id, amount);
    if (!result.error) { currentDemo.current = result.state; setDemoState(result.state); }
    return result.error;
  }
  async function createAuction(values) {
    const result = await api('/auctions', { method: 'POST', body: values });
    setAccountAuctions((items) => [result.auction, ...items]);
    const data = await api('/categories').catch(() => null); if (data) setCategories(data.categories);
    return result.auction.id;
  }

  async function updateAuction(id, body) {
    const result = await api(`/auctions/${id}`, { method: 'PATCH', body });
    setAccountAuctions((items) => items.map((item) => item.id === id ? result.auction : item));
    const data = await api('/categories').catch(() => null); if (data) setCategories(data.categories);
    return result.auction;
  }

  async function markNotification(id, read = true) {
    try {
      if (profile) { await api(`/account/notifications/${id}`, { method: 'PATCH', body: { read } }); setAccountNotifications((items) => items.map((n) => n.id === id ? { ...n, readAt: read ? Date.now() : null } : n)); }
      else { const next = { ...currentDemo.current, notifications: (currentDemo.current.notifications || []).map((n) => n.id === id ? { ...n, readAt: read ? Date.now() : null } : n) }; currentDemo.current = next; setDemoState(next); }
    } catch (error) { setNotificationError(error.message); }
  }
  async function markAllRead() {
    try {
      if (profile) { await api('/account/notifications/read-all', { method: 'POST' }); setAccountNotifications((items) => items.map((n) => ({ ...n, readAt: n.readAt || Date.now() }))); }
      else { const next = { ...currentDemo.current, notifications: (currentDemo.current.notifications || []).map((n) => ({ ...n, readAt: n.readAt || Date.now() })) }; currentDemo.current = next; setDemoState(next); }
    } catch (error) { setNotificationError(error.message); }
  }
  return <DemoContext.Provider value={{
    auctions: profile ? accountAuctions : demoState.auctions,
    categories: profile ? categories : defaults.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) })), notifications: profile ? accountNotifications : demoState.notifications || [], markNotification, markAllRead, notificationError,
    guest: demoState.guest, profile, authReady, demoMode: !profile,
    warning: [warning, accountWarning].filter(Boolean).join(' '),
    authenticate, signOut, updateAccount, refreshAuctions, placeBid, createAuction, updateAuction,
  }}>{children}</DemoContext.Provider>;
}
