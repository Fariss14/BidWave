import { useSearchParams } from 'react-router-dom';
import OrderTabs from '../components/OrderTabs';
import { matchesOrder } from '../utils/orderStages';
import OrderActions from '../components/OrderActions';
import OrderFulfillment from '../components/OrderFulfillment';
import { useEffect, useState } from 'react';
import { api } from '../state/api';
import { money } from '../utils/auction';
import { useConfirm } from '../components/confirmation/context';
export default function Sales() {
  const [sales, setSales] = useState([]), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'all';
  const confirm = useConfirm();
  async function refresh() { try { const data = await api('/account/sales'); setSales(data.sales); setError(''); } catch (e) { setError(e.message); } }
  useEffect(() => { const timer = setInterval(refresh, 15000); const initial = setTimeout(refresh, 0); window.addEventListener('focus', refresh); return () => { clearTimeout(initial); clearInterval(timer); window.removeEventListener('focus', refresh); }; }, []);
  async function review(order, decision, rejectionReason) {
    if (!await confirm({ title: decision === 'confirmed' ? 'Confirm funds received? This decision is final.' : 'Reject this payment proof?', description: 'Check your receiving account before confirming payment.', confirmLabel: 'Confirm decision' })) return;
    setPending(true);
    try { await api(`/account/sales/${order.id}/payment`, { method: 'PATCH', body: { paymentId: order.payment.id, decision, rejectionReason } }); await refresh(); } catch (e) { setError(e.message); } finally { setPending(false); }
  }
  return <><h1>Sales / Received payments</h1><OrderTabs seller orders={sales} value={tab} onChange={(tab) => setParams({ tab })} />{error && <p role="alert">{error} <button onClick={refresh}>Retry</button></p>}{!sales.length && <p>No sales yet.</p>}{sales.filter((o) => matchesOrder(o,tab)).map((o) => <section className="dashboard-panel" key={o.id}><h2>{o.title}</h2><OrderActions order={o} seller /><OrderFulfillment key={`${o.id}-${o.fulfillment?.status || "pending"}`} order={o} seller /><p>{o.buyer} · {money(o.amount)} · {o.payment?.status === 'confirmed' ? 'Paid' : o.payment?.status || 'Awaiting proof'}</p>{[...o.history, ...(o.payment ? [o.payment] : [])].map((p) => <div key={p.id}><p>{p.method} · {p.reference} · {new Date(p.submittedAt).toLocaleString()} · {p.status}</p><p>{p.rejectionReason}</p><a className="text-link" href={`/api/account/payments/${p.id}/proof?preview=1`} target="_blank" rel="noopener noreferrer">Preview proof</a> <a className="text-link" href={`/api/account/payments/${p.id}/proof`} download>Download receipt / proof</a>{p.shippingAddress && <p>Ship to: {Object.values(p.shippingAddress).filter((v) => typeof v === 'string').join(', ')}</p>}</div>)}{o.payment?.status === 'pending_verification' && <form onSubmit={(e) => { e.preventDefault(); review(o, 'rejected', new FormData(e.currentTarget).get('reason')); }}><button type="button" className="button" disabled={pending} onClick={() => review(o, 'confirmed')}>Confirm payment received</button><label>Rejection reason<textarea name="reason" required maxLength="1000" /></label><button className="button button-outline" disabled={pending}>Reject proof</button></form>}</section>)}</>;
}
