import { useState } from 'react';
import { api } from '../state/api';
import { useConfirm } from './confirmation/context';
export default function OrderFulfillment({ order, seller = false }) {
  const confirm = useConfirm();
  const [saved, setSaved] = useState(null), [pending, setPending] = useState(false), [error, setError] = useState('');
  const current = saved && saved.id === order.id && (!order.fulfillment || saved.fulfillment.completedAt || !order.fulfillment.completedAt) ? saved : order;
  if (order.demo || order.payment?.status !== 'confirmed') return null;
  const state = current.fulfillment;
  async function update(action, values = {}) {
    if (!await confirm({ title: action === 'ship' ? 'Mark this order shipped?' : 'Confirm you received this item?', description: action === 'ship' ? 'Confirm that you handed the parcel to the carrier. The buyer will receive these tracking details.' : 'This marks the order completed. Confirm only after you receive the item.', confirmLabel: action === 'ship' ? 'Mark shipped' : 'Confirm receipt' })) return;
    setPending(true); setError('');
    try { const result = await api(`/account/orders/${order.id}/fulfillment`, { method: 'PATCH', body: { action, ...values } }); setSaved(result.order); }
    catch (failure) { setError(failure.message); } finally { setPending(false); }
  }
  return <section className="notice"><h3>{state?.status === 'completed' ? 'Order completed' : state ? 'Shipped' : 'Paid · Awaiting shipment'}</h3>{state && <><p>Carrier: {state.carrier}<br />Tracking number: {state.trackingNumber}</p><p>Shipped: {new Date(state.shippedAt).toLocaleString()}</p>{state.completedAt && <p>Receipt confirmed: {new Date(state.completedAt).toLocaleString()}</p>}<p className="field-hint">Check this tracking number with the carrier. Tracking updates are not synchronized automatically.</p></>}{seller && !state && <form onSubmit={(event) => { event.preventDefault(); update('ship', Object.fromEntries(new FormData(event.currentTarget))); }}><label>Carrier<input name="carrier" required maxLength="100" /></label><label>Tracking number<input name="trackingNumber" required maxLength="100" /></label><button className="button" disabled={pending}>Mark as shipped</button></form>}{!seller && state?.status === 'shipped' && <button className="button" disabled={pending} onClick={() => update('complete')}>Confirm item received</button>}{error && <p className="form-error" role="alert">{error}</p>}</section>;
}
