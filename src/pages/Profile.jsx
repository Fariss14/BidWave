import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FiArrowUpRight } from 'react-icons/fi';
import { useConfirm } from '../components/confirmation/context';
import { useDemo } from '../state/context';

export default function Profile({ signup = false }) {
  const confirm = useConfirm();
  const { profile, authReady, authenticate } = useDemo();
  const [params] = useSearchParams();
  const rawReturn = params.get('returnTo');
  const returnTo = rawReturn && /^\/(sell|dashboard(?:\/(?:[a-z-]+|listings\/[a-zA-Z0-9-]+\/edit))?|auctions(?:\/[a-zA-Z0-9-]+)?)(?:\?.*)?$/.test(rawReturn) ? rawReturn : '/dashboard';
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  if (!authReady) return <section className="section empty-state" role="status">Checking your session…</section>;
  if (profile) return <Navigate to={returnTo} replace />;
  const other = `${signup ? '/login' : '/signup'}?returnTo=${encodeURIComponent(returnTo)}`;
  async function submit(event) {
    event.preventDefault(); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (signup && values.password !== values.confirmPassword) { setError('Your passwords do not match.'); return; }
    if (signup && !values.name.trim()) { setError('Enter your name.'); return; }
    if (signup && !await confirm({ title: 'Create your BidWave account?', details: <p>{values.name}<br />{values.email}</p>, confirmLabel: 'Create account' })) return;
    setPending(true);
    try { await authenticate(signup ? 'signup' : 'login', values); navigate(returnTo, { replace: true }); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <section className="section profile-page">
    <div className="profile-story"><span className="eyebrow">Welcome to the wave</span><h1>A great find.<br />A fresh start.</h1><p>Your finds, bids, and listings, all in one place. Create an account or explore the guest demo at your own pace.</p><Link className="text-link" to="/auctions">Try guest bidding — no account needed <FiArrowUpRight /></Link><span className="story-wave" aria-hidden="true">≈</span></div>
    <div className="form-panel"><span className="eyebrow">Your BidWave account</span><h2>{signup ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{signup ? 'A few details and you’re ready to discover.' : 'Sign in to pick up where you left off.'}</p>
      <form onSubmit={submit}>
        {signup && <><label htmlFor="account-name">Name</label><input id="account-name" name="name" autoComplete="name" required maxLength="40" placeholder="Your name" /></>}
        <label htmlFor="account-email">Email address</label><input id="account-email" name="email" type="email" autoComplete="email" required maxLength="254" placeholder="you@gmail.com" aria-describedby={signup ? 'email-note' : undefined} />
        {signup && <p className="field-hint" id="email-note">Email verification is off for testing. You can use a made-up email address in a valid format.</p>}
        <label htmlFor="account-password">Password</label><div className="password-control"><input id="account-password" name="password" type={visible ? 'text' : 'password'} autoComplete={signup ? 'new-password' : 'current-password'} required minLength="10" maxLength="128" aria-describedby="password-note" /><button type="button" onClick={() => setVisible(!visible)} aria-pressed={visible}>{visible ? 'Hide' : 'Show'}</button></div><p className="field-hint" id="password-note">Use 10–128 characters.</p>
        {signup && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirmPassword" type={visible ? 'text' : 'password'} autoComplete="new-password" required minLength="10" maxLength="128" /></>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button full-width" disabled={pending}>{pending ? 'Please wait…' : signup ? 'Create account' : 'Sign in'} {!pending && <FiArrowUpRight />}</button>
      </form>
      <p className="field-hint account-switch">{signup ? 'Already have an account?' : 'New to BidWave?'} <Link className="text-link" to={other}>{signup ? 'Sign in' : 'Create an account'}</Link></p>
    </div>
  </section>;
}
