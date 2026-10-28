import { Link } from 'react-router-dom';
import { FiArrowUpRight, FiMonitor, FiShoppingBag, FiDisc } from 'react-icons/fi';
import AuctionCard from './AuctionCard';
import { useDemo } from '../state/context';
import useClock from '../utils/useClock';
export default function Hero() {
  const {
    auctions
  } = useDemo();
  const now = useClock();
  const featured = auctions.find(a => a.id === 'studio-headphones') || auctions[0];
  return <section className="hero"><div className="hero-content"><span className="eyebrow"><span className="status-dot" /> A new wave of discoveries</span><h1>Your next great<br />find starts with<br /><span>a bid.</span></h1><p>For the collectors, the curious, and everyone who loves a great find. Discover something worth bidding for.</p><div className="hero-actions"><Link className="button" to="/auctions">Explore auctions <FiArrowUpRight /></Link><Link className="button button-outline" to="/sell">Start selling</Link></div><div className="hero-categories"><Link to="/auctions?category=electronics"><FiMonitor /> Electronics</Link><Link to="/auctions?category=collectibles"><FiDisc /> Collectibles</Link><Link to="/auctions?category=fashion"><FiShoppingBag /> Fashion</Link></div><div className="hero-note"><span className="note-line" /> Unique finds. A little friendly competition.</div></div><div className="hero-showcase">{featured && <AuctionCard auction={featured} featured now={now} />}<div className="showcase-note"><span className="status-dot" /> Your next discovery is waiting</div></div></section>;
}
