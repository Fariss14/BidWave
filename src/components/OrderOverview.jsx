import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../state/api';
import { matchesOrder } from '../utils/orderStages';
export default function OrderOverview() {
  const [data, setData] = useState(null), [error, setError] = useState('');
  useEffect(() => { let active = true; async function refresh() { try { const [buyer,seller] = await Promise.all([api('/account/orders'),api('/account/sales')]); if (active) { setData({ buyer: buyer.orders.filter((o) => !o.demo), seller: seller.sales }); setError(''); } } catch (e) { if (active) setError(e.message); } } refresh(); const timer = setInterval(refresh,15000); return () => { active = false; clearInterval(timer); }; }, []);
  return <section className="dashboard-panel"><h2>Orders needing attention</h2>{error && <p role="alert">{error}</p>}{!data && !error && <p>Loading order summary…</p>}{data && <div className="dashboard-quick-links">{[['buyer','pay','To pay'],['buyer','receive','To receive'],['buyer','shipped','Shipped purchases'],['seller','review','Payments to review'],['seller','receive','To ship'],['seller','cancellations','Cancellation requests'],['seller','returns','Returns'],['seller','refunds','Refunds']].map(([role,tab,label]) => <Link className="dashboard-panel" key={role+tab} to={`/dashboard/${role === 'buyer' ? 'purchases' : 'sales'}?tab=${tab}`}>{label}: <strong>{data[role].filter((o) => matchesOrder(o,tab)).length}</strong></Link>)}</div>}</section>;
}
