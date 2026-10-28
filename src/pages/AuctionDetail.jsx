import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { FiArrowLeft, FiClock } from 'react-icons/fi';
import { useDemo } from '../state/context';
import { money, timeLeft, minimumBid } from '../utils/auction';
import useClock from '../utils/useClock';
import AuctionImage from '../components/AuctionImage';
import ProceedToPayment from '../components/ProceedToPayment';
import AuctionDistance from '../components/AuctionDistance';
import { useConfirm } from '../components/confirmation/context';
export default function AuctionDetail() {
  const confirm = useConfirm();
  const { state: navigationState } = useLocation();
  const {
    id
  } = useParams();
  const {
    auctions,
    profile,
    placeBid,
    demoMode
  } = useDemo();
  const auction = auctions.find(a => a.id === id);
  const [amount, setAmount] = useState('');
  const [feedback, setFeedback] = useState(null);
  const now = useClock();
  const [pending, setPending] = useState(false);
  if (!auction || auction.endsAt <= now) return <section className="section empty-state"><h1>Auction not found</h1><p>This find may no longer be available.</p><Link className="button" to="/auctions">Explore auctions</Link></section>;
  const ended = auction.endsAt <= now;
  const own = profile?.id === auction.seller.id;
  async function submit(e) {
    e.preventDefault();
    if (!await confirm({ title: demoMode ? 'Place this demo bid?' : 'Place this bid?', description: demoMode ? 'This bid is part of the local demo only.' : 'This bid will be recorded on your account.', details: <p>{auction.title}<br />Your bid: {money(Number(amount))}<br />Minimum next bid: {money(minimumBid(auction))}</p>, confirmLabel: demoMode ? 'Place demo bid' : 'Place bid' })) return;
    setPending(true);
    const error = await placeBid(id, Number(amount));
    setPending(false);
    setFeedback({
      error: !!error,
      text: error || `Your ${demoMode ? "demo " : ""}bid of ${money(Number(amount))} was placed.`
    });
    if (!error) setAmount('');
  }
  return <section className="section page-section">{navigationState?.listingUpdated && <p className="form-success" role="status">Listing updated successfully.</p>}<Link className="back-link" to="/auctions"><FiArrowLeft /> Back to discoveries</Link><div className="detail-grid"><div className="detail-image"><AuctionImage src={auction.image} alt={auction.title} /></div><div className="detail-content"><span className="eyebrow">{auction.categoryName || auction.category}</span><h1>{auction.title}</h1>{auction.example && <p className="notice">Example listing. Bids on this sample do not create a real purchase or expose real seller details.</p>}<p className="muted">Listed by {auction.seller.name}</p><AuctionDistance key={auction.id} auction={auction} /><p className="item-description">{auction.description}</p><div className="bid-summary"><div><span className="muted">{auction.bids.length ? 'Current bid' : 'Starting bid'}</span><strong>{money(auction.currentBid)}</strong></div><div className={ended ? 'ended countdown' : 'countdown'}><FiClock /><span>{timeLeft(auction.endsAt, now)}</span></div></div><p className="muted end-date">Ends {new Date(auction.endsAt).toLocaleString('en-PH')}</p>{ended ? <div className="notice">This auction has ended.{profile && auction.bids[0]?.bidderId === profile.id && <> You won this auction. <ProceedToPayment auctionId={id} /></>}</div> : own ? <div className="notice">This is your listing. You can follow its bids here. <Link className="text-link" to={`/dashboard/listings/${id}/edit`}>Edit listing / end date</Link></div> : <form onSubmit={submit} className="bid-form"><label htmlFor="bid-amount">Your {profile ? "" : "guest demo "}bid (PHP)</label><div className="bid-input-row"><input id="bid-amount" type="number" min={minimumBid(auction)} step="1" required value={amount} onChange={e => {
              setAmount(e.target.value);
              setFeedback(null);
            }} placeholder={String(minimumBid(auction))} aria-describedby={feedback ? 'bid-hint bid-feedback' : 'bid-hint'} /><button className="button" type="submit" disabled={pending}>{pending ? "Placing bid…" : demoMode ? "Place demo bid" : "Place bid"}</button></div><p id="bid-hint" className="field-hint">Minimum bid: {money(minimumBid(auction))}. Increment: {auction.increment === 0 ? 'No increment / N/A (bid above the current price)' : money(auction.increment ?? 1)}. Whole pesos only.</p></form>}{feedback && <p id="bid-feedback" role={feedback.error ? 'alert' : 'status'} className={feedback.error ? 'form-error' : 'form-success'}>{feedback.text}{!feedback.error && <> <Link className="text-link" to="/dashboard/bids">View my bids</Link></>}</p>}<p className="field-hint">{profile ? "Your bid is saved to your account and checked by the server." : "Try bidding as a guest — no account needed. These demo bids stay in this browser."}</p></div></div><section className="history-section"><div className="section-heading"><h2>Bid history</h2><span className="muted">{auction.bids.length} {auction.bids.length === 1 ? 'bid' : 'bids'}</span></div>{auction.bids.length ? <ol className="bid-history">{auction.bids.map(b => <li key={b.id}><div><strong>{b.bidder}</strong><time dateTime={new Date(b.at).toISOString()}>{new Date(b.at).toLocaleString('en-PH')}</time></div><strong>{money(b.amount)}</strong></li>)}</ol> : <p className="notice">No bids yet. This find is waiting for its first move.</p>}</section></section>;
}
