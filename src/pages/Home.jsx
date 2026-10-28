import { Link } from 'react-router-dom';
import { FiArrowUpRight, FiSearch, FiTrendingUp, FiPackage } from 'react-icons/fi';
import Hero from '../components/Hero';
import AuctionCard from '../components/AuctionCard';
import { useDemo } from '../state/context';
import useClock from '../utils/useClock';
export default function Home() {
  const {
    auctions
  } = useDemo();
  const now = useClock();
  return <><Hero /><section className="section"><div className="section-heading"><div><span className="eyebrow">The discovery edit</span><h2>Good finds. Great possibilities.</h2></div><Link className="text-link" to="/auctions">View all auctions <FiArrowUpRight /></Link></div><div className="auction-grid">{auctions.filter((a) => a.endsAt > now).slice(0, 3).map(a => <AuctionCard key={a.id} auction={a} now={now} />)}</div></section><section id="how-it-works" className="section how-section"><span className="eyebrow">A few steps to your next find</span><h2>Catch your next wave.</h2><div className="steps">{[[FiSearch, '01', 'Find your something', 'Explore electronics, collectibles, and fashion. Follow your curiosity.'], [FiTrendingUp, '02', 'Make your move', 'Try a guest demo bid or create an account to join the auctions. Watch the countdown and bid history.'], [FiPackage, '03', 'Try the other side', 'Have something special? Sign in, create a listing, and see it in the marketplace.']].map(([Icon, n, title, text]) => <article key={n}><div className="step-top"><Icon /><span>{n}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div><p className="muted demo-disclosure">Guest bidding is a local demo. Signed-in accounts use the shared marketplace. Payment proof is reviewed separately; uploading a receipt does not confirm payment.</p></section></>;
}
