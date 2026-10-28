import useClock from '../utils/useClock';
import { useState } from 'react';
import { api } from '../state/api';
import { useConfirm } from './confirmation/context';
export default function OrderActions({ order, seller = false }) {
  const [local, setLocal] = useState(null), [error, setError] = useState(''), [pending, setPending] = useState(false);
  const now = useClock();
  const confirm = useConfirm(); const o = local || order;
  if (o.demo) return null;
  const actions = [];
  if (!seller && !o.fulfillment && !o.cancellation) actions.push(['cancel_request', 'Request cancellation', ['reason']]);
  if (seller && o.cancellation?.status === 'requested') actions.push(['cancel_approve','Approve cancellation',[]], ['cancel_reject','Reject cancellation',['reason']]);
  if (!seller && o.fulfillment?.status === 'completed' && now <= o.fulfillment.completedAt + 604800000 && !o.return) actions.push(['return_request','Request return',['reason']]);
  if (seller && o.return?.status === 'requested') actions.push(['return_approve','Approve return',['instructions']], ['return_reject','Reject return',['reason']]);
  if (!seller && o.return?.status === 'approved') actions.push(['return_ship','Record return shipment',['carrier','trackingNumber']]);
  if (seller && o.return?.status === 'shipped') actions.push(['return_receive','Confirm returned item received',[]]);
  if (seller && o.refund?.status === 'required') actions.push(['refund_record','Record full refund sent',['reference']]);
  if (!seller && o.refund?.status === 'sent') actions.push(['refund_confirm','Confirm refund received',[]]);
  async function submit(e, action) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const values = Object.fromEntries(form); delete values.proof;
    if (!await confirm({ title: action.replaceAll('_',' ') + '?', description: 'Review this order action before continuing. Refund transfers happen outside BidWave.' })) return;
    setPending(true); try { if (action === 'refund_record') { const upload = new FormData(); upload.set('proof', form.get('proof')); await api(`/account/orders/${o.id}/refund-proof`, { method: 'POST', body: upload }); } const result = await api(`/account/orders/${o.id}/action`, { method: 'PATCH', body: { action, ...values } }); setLocal(result.order); } catch (failure) { setError(failure.message); } finally { setPending(false); }
  }
  return <details><summary>Order details and requests</summary>{['cancellation','return','refund'].map((key) => o[key] && <div key={key}><h3>{key}: {o[key].status}</h3>{Object.entries(o[key]).filter(([k]) => k !== 'status').map(([k,v]) => <p key={k}>{k}: {String(v)}</p>)}</div>)}{actions.map(([action,label,fields]) => <form key={action} onSubmit={(e) => submit(e, action)}>{fields.map((field) => <label key={field}>{field}<input name={field} required maxLength={field === 'instructions' ? 2000 : field === 'reason' ? 1000 : 100} /></label>)}<span>{action === 'refund_record' && <label>Refund transfer proof<input type="file" name="proof" required accept="image/png,image/jpeg,image/webp,application/pdf" /></label>}</span><button className="button button-small" disabled={pending}>{label}</button></form>)}{error && <p role="alert">{error}</p>}<a className="text-link" href={`/api/account/orders/${o.id}/refund-proof`} download hidden={!o.refund || o.refund.status === 'required'}>Download refund proof</a><h3>Order history</h3>{o.timeline?.map((event,i) => <p key={i}>{event.action.replaceAll('_',' ')} · {new Date(event.at).toLocaleString()}</p>)}</details>;
}
