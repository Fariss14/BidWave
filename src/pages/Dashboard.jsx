import OrderOverview from '../components/OrderOverview';
import { useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FiActivity, FiBell, FiArrowUpRight, FiCreditCard, FiGrid, FiLogOut, FiMapPin, FiMenu, FiPackage, FiUser, FiX } from 'react-icons/fi';
import { useConfirm } from '../components/confirmation/context';
import { useDemo } from '../state/context';
import { money, timeLeft } from '../utils/auction';
import ProceedToPayment from '../components/ProceedToPayment';
import useClock from '../utils/useClock';

const navigation = [
  { to: '/dashboard', label: 'Overview', icon: FiGrid, end: true },
  { to: '/dashboard/sales', label: 'Sales', icon: FiCreditCard },
  { to: '/dashboard/bids', label: 'My bids', icon: FiActivity },
  { to: '/dashboard/archive', label: 'Ended listings', icon: FiPackage },
  { to: '/dashboard/listings', label: 'My listings', icon: FiPackage },
  { to: '/dashboard/purchases', label: 'Purchases', icon: FiCreditCard },
  { to: '/dashboard/addresses', label: 'Shipping address', icon: FiMapPin },
  { to: '/dashboard/notifications', label: 'Notifications', icon: FiBell },
  { to: '/dashboard/seller', label: 'Seller contact & payments', icon: FiCreditCard },
  { to: '/dashboard/account', label: 'Account settings', icon: FiUser },
];

export default function Dashboard() {
  const confirm = useConfirm();
  const { profile, signOut, authReady } = useDemo();
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const current = navigation.find((item) => item.to === pathname)?.label || (pathname.startsWith('/dashboard/listings/') ? 'Edit listing' : 'My account');
  function close() { setOpen(false); }
  if (!authReady) return <section className="section empty-state" role="status">Checking your session…</section>;
  return <div className="dashboard-layout" onKeyDown={(event) => { if (event.key === 'Escape') { close(); trigger.current?.focus(); } }}>
    <div className="dashboard-mobile-bar">
      <span>{current}</span>
      <button ref={trigger} className="button button-small button-outline" aria-expanded={open} aria-controls="account-sidebar" onClick={() => setOpen(!open)}>{open ? <FiX /> : <FiMenu />} Account menu</button>
    </div>
    <aside id="account-sidebar" className={`account-sidebar ${open ? 'is-open' : ''}`}>
      <div className="sidebar-profile"><span className="avatar" aria-hidden="true">{(profile?.name || 'Guest').slice(0, 1).toUpperCase()}</span><div><strong>{profile?.name || 'Demo visitor'}</strong><span>{profile ? 'Your account' : 'Guest demo session'}</span></div></div>
      <nav aria-label="Account navigation">{navigation.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} onClick={close}><Icon aria-hidden="true" />{label}</NavLink>)}</nav>
      <div className="sidebar-bottom"><Link to="/auctions" onClick={close}>Explore auctions <FiArrowUpRight /></Link>{profile ? <button onClick={async () => { if (!await confirm({ title: 'Sign out of BidWave?', confirmLabel: 'Sign out' })) return; if (await signOut()) { close(); navigate('/'); } }}><FiLogOut /> Sign out</button> : <Link to="/login?returnTo=%2Fdashboard"><FiUser /> Sign in</Link>}</div>
    </aside>
    <div className="dashboard-content"><Outlet /></div>
  </div>;
}

export function DashboardOverview() {
  const { auctions, profile, guest } = useDemo();
  const now = useClock();
  const actor = profile || guest;
  const bids = auctions.filter((a) => a.bids.some((b) => b.bidderId === actor.id));
  const listings = auctions.filter((a) => a.seller.id === profile?.id);
  const winning = bids.filter((a) => a.endsAt <= now && a.bids[0]?.bidderId === actor.id);
  return <><div className="dashboard-heading"><span className="eyebrow">Your corner of the wave</span><h1>Hello, {profile?.name || 'explorer'}.</h1><p className="muted">Keep track of your finds, your bids, and what comes next.</p></div>{!profile && <div className="notice">You’re exploring as a guest. Try demo bidding without an account, or <Link className="text-link" to="/signup?returnTo=%2Fdashboard">create an account</Link> to set up your dashboard.</div>}{profile && <OrderOverview />}<div className="dashboard-stats"><Link to="/dashboard/bids"><FiActivity /><span>Auctions you’ve bid on</span><strong>{bids.length}</strong></Link><Link to="/dashboard/listings"><FiPackage /><span>Your listings</span><strong>{listings.length}</strong></Link><Link to="/dashboard/payments"><FiCreditCard /><span>Won auctions</span><strong>{winning.length}</strong></Link></div><section className="dashboard-panel"><div className="section-heading"><h2>Your recent bids</h2><Link className="text-link" to="/dashboard/bids">View all <FiArrowUpRight /></Link></div><ActivityList auctions={bids.slice(0, 4)} now={now} actor={actor} /></section><div className="dashboard-quick-links"><Link className="dashboard-panel" to="/dashboard/addresses"><FiMapPin /><h3>Ready for your next find?</h3><p>Set up your shipping address.</p><span className="text-link">Manage address <FiArrowUpRight /></span></Link><Link className="dashboard-panel" to="/sell"><FiPackage /><h3>Pass on something special.</h3><p>Create a listing for your next great auction.</p><span className="text-link">Start selling <FiArrowUpRight /></span></Link></div></>;
}

function ActivityList({ auctions, now, actor, listings = false }) {
  if (!auctions.length) return <div className="dashboard-empty"><FiActivity /><h3>{listings ? 'Your next listing starts here' : 'Your next bid is waiting'}</h3><p>{listings ? 'Put something special in the spotlight.' : 'Explore the auctions and try a guest demo bid.'}</p><Link className="button button-small" to={listings ? '/sell' : '/auctions'}>{listings ? 'Create a listing' : 'Explore auctions'} <FiArrowUpRight /></Link></div>;
  return <ul className="activity-list">{auctions.map((a) => { const ended = a.endsAt <= now; const leading = a.bids[0]?.bidderId === actor.id; return <li key={a.id}><div><Link to={`/auctions/${a.id}`}>{a.title}</Link><span>{timeLeft(a.endsAt, now)}</span>{listings && !ended && <Link className="button button-small button-outline" to={`/dashboard/listings/${a.id}/edit`}>Edit listing / end date</Link>}{!listings && ended && leading && <ProceedToPayment auctionId={a.id} />}{listings && a.needsSettlement && <Link className="text-link" to="/dashboard/seller">Complete seller settlement setup</Link>}</div><div><strong>{money(a.currentBid)}</strong><span className={`status-badge ${leading ? 'status-positive' : ''}`}>{listings ? `${a.bids.length} bids` : ended ? (leading ? 'Won' : 'Lost') : (leading ? 'Leading' : 'Outbid')}</span></div></li>; })}</ul>;
}

export function DashboardActivity({ listings = false }) {
  const { auctions, profile, guest } = useDemo();
  const now = useClock();
  const actor = profile || guest;
  const items = auctions.filter((a) => listings ? a.seller.id === profile?.id && a.endsAt > now : a.bids.some((b) => b.bidderId === actor.id));
  return <><div className="dashboard-heading"><span className="eyebrow">{listings ? 'In your spotlight' : 'Follow your finds'}</span><h1>{listings ? 'My listings' : 'My bids'}</h1><p className="muted">{listings ? 'Track the items you’ve shared with the marketplace.' : 'See where you’re leading and which finds need another move.'}</p></div>{listings && <Link className="text-link" to="/sell">Create a listing / resume draft</Link>}<section className="dashboard-panel"><ActivityList auctions={items} now={now} actor={actor} listings={listings} /></section></>;
}
