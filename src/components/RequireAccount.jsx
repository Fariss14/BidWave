import { Link, useLocation } from 'react-router-dom';
import { useDemo } from '../state/context';
export default function RequireAccount({ children }) {
  const { profile, authReady } = useDemo();
  const { pathname } = useLocation();
  if (!authReady) return <div className="dashboard-empty" role="status">Checking your session…</div>;
  if (!profile) return <section className="dashboard-panel dashboard-empty"><h1>Make this space yours.</h1><p>Sign in to save account details, shipping addresses, and payment submissions.</p><Link className="button" to={`/login?returnTo=${encodeURIComponent(pathname)}`}>Sign in</Link><Link className="text-link" to="/auctions">Or keep trying guest bidding</Link></section>;
  return children;
}
