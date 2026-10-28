import { Link } from 'react-router-dom';
import { FiArrowUpRight, FiClock } from 'react-icons/fi';
import { areaLabel } from '../utils/location';
import { money, timeLeft } from '../utils/auction';
import AuctionImage from './AuctionImage';
export default function AuctionCard({
  auction,
  featured = false,
  compact = false,
  now
}) {
  return <article className={`auction-card ${featured ? 'featured-card' : ''} ${compact ? 'compact-card' : ''}`}>
    <Link to={`/auctions/${auction.id}`} className="card-image-link" aria-label={`View ${auction.title}`}><AuctionImage src={auction.image} alt={auction.title} /><span className="image-tag">{auction.categoryName || auction.category}{auction.example && ' · Example'}</span></Link>
    <div className="card-content">
      {featured && <span className="eyebrow">In the spotlight</span>}
      <h3><Link to={`/auctions/${auction.id}`}>{auction.title}</Link></h3><p className="card-area">{areaLabel(auction.location)}</p>
      <div className="card-stats"><div><span>{auction.bids.length ? 'Current bid' : 'Starting bid'}</span><strong>{money(auction.currentBid)}</strong></div><div className="card-time"><FiClock aria-hidden="true" /><span>{timeLeft(auction.endsAt, now)}</span></div></div>
      {!compact && <div className="card-footer"><span>{auction.bids.length} {auction.bids.length === 1 ? 'bid' : 'bids'}</span><Link className="text-link" to={`/auctions/${auction.id}`}>View auction <FiArrowUpRight aria-hidden="true" /></Link></div>}
    </div>
  </article>;
}
