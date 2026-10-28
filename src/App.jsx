import ListingArchive from './pages/ListingArchive';
import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Auctions from './pages/Auctions';
import AuctionDetail from './pages/AuctionDetail';
import SellItem from './pages/SellItem';
import EditListing from './pages/EditListing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import DemoProvider from './state/DemoProvider';
import { useDemo } from './state/context';
import Dashboard, { DashboardActivity, DashboardOverview } from './pages/Dashboard';
import RequireAccount from './components/RequireAccount';
import Addresses from './pages/Addresses';
import Sales from './pages/Sales';
import Payments from './pages/Payments';
import AccountSettings from './pages/AccountSettings';
import SellerSettings from './pages/SellerSettings';
import Notifications from './pages/Notifications';
import ConfirmationProvider from './components/confirmation/ConfirmationProvider';
function PageEffects() {
  const {
    pathname,
    hash
  } = useLocation();
  const {
    auctions
  } = useDemo();
  const auctionTitle = auctions.find(a => `/auctions/${a.id}` === pathname)?.title;
  useEffect(() => {
    const titles = {
      '/': 'Discover your next great find',
      '/auctions': 'Explore auctions',
      '/sell': 'Sell an item',
      '/login': 'Sign in',
      '/signup': 'Create an account',
      '/dashboard': 'My dashboard', '/dashboard/bids': 'My bids', '/dashboard/listings': 'My listings',
      '/dashboard/payments': 'Payments', '/dashboard/addresses': 'Shipping address', '/dashboard/account': 'Account settings', '/dashboard/seller': 'Seller contact and payments', '/dashboard/notifications': 'Notifications'
    };
    document.title = `${/^\/dashboard\/listings\/[^/]+\/edit$/.test(pathname) ? 'Edit listing' : auctionTitle || titles[pathname] || 'Page not found'} | BidWave`;
  }, [pathname, auctionTitle]);
  useEffect(() => {
    if (hash === '#how-it-works') document.getElementById('how-it-works')?.scrollIntoView();else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}
function AppContent() {
  const {
    warning
  } = useDemo();
  return <><PageEffects /><a className="skip-link" href="#main-content">Skip to content</a><Navbar />{warning && <div className="storage-warning" role="alert">{warning}</div>}<main id="main-content" tabIndex="-1"><Routes><Route path="/" element={<Home />} /><Route path="/auctions" element={<Auctions />} /><Route path="/auctions/:id" element={<AuctionDetail />} /><Route path="/sell" element={<SellItem />} /><Route path="/login" element={<Login />} /><Route path="/signup" element={<Signup />} /><Route path="/dashboard" element={<Dashboard />}><Route index element={<DashboardOverview />} /><Route path="bids" element={<DashboardActivity />} /><Route path="listings" element={<DashboardActivity listings />} /><Route path="listings/:id/edit" element={<RequireAccount><EditListing /></RequireAccount>} /><Route path="archive" element={<RequireAccount><ListingArchive /></RequireAccount>} /><Route path="archive/:id" element={<RequireAccount><ListingArchive /></RequireAccount>} /><Route path="sales" element={<RequireAccount><Sales /></RequireAccount>} /><Route path="purchases" element={<RequireAccount><Payments /></RequireAccount>} /><Route path="payments" element={<Navigate to="/dashboard/purchases" replace />} /><Route path="addresses" element={<RequireAccount><Addresses /></RequireAccount>} /><Route path="notifications" element={<Notifications />} /><Route path="seller" element={<RequireAccount><SellerSettings /></RequireAccount>} /><Route path="account" element={<RequireAccount><AccountSettings /></RequireAccount>} /></Route><Route path="*" element={<section className="section empty-state"><span className="eyebrow">Off the beaten path</span><h1>That page drifted away.</h1><p>There are more discoveries waiting for you.</p><Link className="button" to="/auctions">Explore auctions</Link></section>} /></Routes></main><footer className="footer"><Link className="brand" to="/"><span className="brand-mark">≈</span>BidWave</Link><p>A new wave of discoveries.</p><span>Guest demo + account marketplace</span><Link to="/#how-it-works">How it works</Link></footer></>;
}
export default function App() {
  return <ConfirmationProvider><DemoProvider><AppContent /></DemoProvider></ConfirmationProvider>;
}
