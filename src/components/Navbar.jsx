import { Link, NavLink } from 'react-router-dom';
import { FiMenu, FiX, FiArrowUpRight, FiBell } from 'react-icons/fi';
import { useState, useRef } from 'react';
import { useConfirm } from './confirmation/context';
import { useDemo } from '../state/context';
export default function Navbar() {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  const {
    profile,
    notifications = [],
    signOut
  } = useDemo();
  function close() {
    setOpen(false);
  }
  return <header className="navbar" onKeyDown={e => {
    if (e.key === 'Escape') {
      close();
      toggle.current?.focus();
    }
  }}>
    <div className="nav-container"><Link to="/" className="brand" onClick={close}><span className="brand-mark">≈</span>BidWave<span className="demo-pill">{profile ? "ACCOUNT" : "GUEST DEMO"}</span></Link>
      <button ref={toggle} className="menu-toggle" type="button" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="primary-nav" onClick={() => setOpen(!open)}>{open ? <FiX /> : <FiMenu />}</button>
      <nav id="primary-nav" className={open ? 'nav-links open' : 'nav-links'} aria-label="Main navigation">
        <NavLink to="/auctions" onClick={close}>Explore auctions</NavLink><Link to="/#how-it-works" onClick={close}>How it works</Link><NavLink to="/sell" onClick={close}>Sell an item</NavLink>
        <div className="nav-account"><Link className="notification-bell" to="/dashboard/notifications" onClick={close} aria-label={`Notifications, ${notifications.filter((n) => !n.readAt).length} unread`}><FiBell />{notifications.some((n) => !n.readAt) && <span>{notifications.filter((n) => !n.readAt).length}</span>}</Link>{profile ? <><Link className="profile-name" title={profile.name} to="/dashboard" onClick={close}>My dashboard</Link><button className="button button-small button-outline" onClick={async () => {
              if (!await confirm({ title: 'Sign out of BidWave?', description: 'Your account activity is saved. Guest demo bidding remains available.', confirmLabel: 'Sign out' })) return;
              await signOut();
              close();
            }}>Sign out</button></> : <><NavLink to="/login" onClick={close}>Sign in</NavLink><Link className="button button-small" to="/signup" onClick={close}>Sign up <FiArrowUpRight /></Link></>}</div>
      </nav>
    </div>
  </header>;
}
