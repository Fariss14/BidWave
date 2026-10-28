import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../state/api';
import { money } from '../utils/auction';
import AuctionImage from '../components/AuctionImage';
export default function ListingArchive() {
  const { id } = useParams();
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { let active = true; api(id ? `/account/listings/${id}` : '/account/listings/archive').then((result) => { if (active) { setData({ ...result, forId: id }); setError(''); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [id]);
  const ready = data && data.forId === id;
  return <><h1>Ended listings</h1><p className="muted">Your private auction archive. Buyers can manage their purchases separately.</p>{error && <p role="alert">{error}</p>}{!ready && !error && <p role="status">Loading archive…</p>}{ready && (id ? <section className="dashboard-panel"><Link className="text-link" to="/dashboard/archive">Back to ended listings</Link><h2>{data.auction.title}</h2><AuctionImage src={data.auction.image} alt={data.auction.title} /><p>{data.auction.description}</p><p>Final price: {money(data.auction.currentBid)} · {data.auction.bids.length} bids</p><p>Ended {new Date(data.auction.endsAt).toLocaleString()}</p><h3>Bid history</h3>{data.auction.bids.map((bid) => <p key={bid.id}>{bid.bidder} · {money(bid.amount)} · {new Date(bid.at).toLocaleString()}</p>)}<Link className="text-link" to="/dashboard/sales">Manage sale</Link></section> : data.auctions.length ? data.auctions.map((a) => <section className="dashboard-panel" key={a.id}><Link to={`/dashboard/archive/${a.id}`}>{a.title}</Link><p>{money(a.currentBid)} · {a.bids.length} bids · Ended {new Date(a.endsAt).toLocaleString()}</p></section>) : <p>No ended listings yet.</p>)}</>;
}
