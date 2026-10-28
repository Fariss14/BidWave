import { useSearchParams } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import { useDemo } from '../state/context';
import { selectAuctions } from '../utils/auction';
import AuctionCard from '../components/AuctionCard';
import useClock from '../utils/useClock';
export default function Auctions() {
  const {
    auctions, categories, demoMode
  } = useDemo();
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const rawCategory = params.get('category') || '';
  const category = categories.some((c) => c.id === rawCategory) ? rawCategory : '';
  const rawSort = params.get('sort');
  const sort = ['ending', 'price-low', 'price-high'].includes(rawSort) ? rawSort : 'ending';
  const now = useClock();
  const results = selectAuctions(auctions.filter((a) => a.endsAt > now), {
    search,
    category,
    sort
  });
  function update(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);else next.delete(key);
    setParams(next, {
      replace: true
    });
  }
  return <section className="section page-section"><span className="eyebrow">Find something worth a bid</span><h1>Explore auctions</h1><p className="page-intro">A little discovery goes a long way. What will you find today?</p>{demoMode && <p className="notice">Try 3 sample products in each category. Bids are simulated and saved only in this browser. No account or payment required.</p>}<div className="browse-toolbar"><label className="search-control"><FiSearch aria-hidden="true" /><span className="sr-only">Search auctions</span><input type="search" placeholder="Search for your next find…" value={search} onChange={e => update('search', e.target.value)} /></label><label className="sort-control">Sort by<select value={sort} onChange={e => update('sort', e.target.value)}><option value="ending">Ending soon</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div><div className="filter-row" role="group" aria-label="Auction category">{[{ id: '', name: 'All finds' }, ...categories].map(c => <button key={c.id} className={`filter-chip ${category === c.id ? 'selected' : ''}`} aria-pressed={category === c.id} onClick={() => update('category', c.id)}>{c.name}</button>)}</div><p className="result-count" role="status">{results.length} {results.length === 1 ? 'auction' : 'auctions'}</p>{results.length ? <div className="auction-grid">{results.map(a => <AuctionCard key={a.id} auction={a} now={now} />)}</div> : <div className="empty-state"><FiSearch /><h2>No finds just yet</h2><p>Try another search or explore all categories.</p><button className="button button-outline" onClick={() => setParams({})}>Clear filters</button></div>}</section>;
}
