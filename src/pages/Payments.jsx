import { useSearchParams } from 'react-router-dom';
import OrderTabs from '../components/OrderTabs';
import { matchesOrder } from '../utils/orderStages';
import OrderActions from '../components/OrderActions';
import OrderFulfillment from '../components/OrderFulfillment';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCreditCard, FiDownload, FiFileText, FiUpload } from 'react-icons/fi';
import { api } from '../state/api';
import { money } from '../utils/auction';
import { useConfirm } from '../components/confirmation/context';

export default function Payments() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'all';
  const confirm = useConfirm();
  const [orders, setOrders] = useState([]);
  const [methods, setMethods] = useState([]);
  const [address, setAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const [o, m, a] = await Promise.all([api('/account/orders'), api('/payment-methods'), api('/account/address')]);
        if (cancelled) return;
        // A slower poll must not erase a proof that was just accepted locally.
        setOrders((previous) => o.orders.map((order) => ({ ...order, payment: order.payment || previous.find((old) => old.id === order.id)?.payment || null })));
        setMethods(m.methods); setAddress(a.address); setError('');
      } catch (failure) { if (!cancelled) setError(failure.message); }
      finally { if (!cancelled) setLoading(false); }
    }
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [retry]);

  async function demoOrder() {
    if (!await confirm({ title: 'Create a sample payment order?', description: 'This is only a walkthrough. No transfer or real purchase is needed.', confirmLabel: 'Create sample order' })) return;
    setPending(true); setError('');
    try { await api('/account/orders/demo', { method: 'POST' }); const data = await api('/account/orders'); setOrders(data.orders); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  function submitted(orderId, payment) { setOrders((items) => items.map((o) => o.id === orderId ? { ...o, payment } : o)); }
  return <><div className="dashboard-heading"><span className="eyebrow">The next step for your winning finds</span><h1>Purchases</h1><p className="muted">Choose a transfer method, upload your screenshot or receipt, and keep a copy of the submission.</p></div><div className="notice">Payment proof is marked <strong>Pending verification</strong>. A submission receipt acknowledges your upload; it does not confirm that funds have arrived.</div>{!address && !loading && <p className="notice"><Link className="text-link" to="/dashboard/addresses">Set up your shipping address</Link> before submitting proof for a won auction. Your saved address fills in automatically.</p>}{loading && <p role="status">Loading your orders…</p>}{error && <div className="form-error" role="alert">{error} <button className="text-button" onClick={() => { setError(''); setLoading(true); setRetry(retry + 1); }}>Retry loading</button></div>}{!loading && !orders.length && <section className="dashboard-panel dashboard-empty"><FiCreditCard /><h2>No winning orders yet</h2><p>When you win an auction, its payment options appear here.</p><Link className="button button-small" to="/auctions">Explore auctions</Link></section>}<OrderTabs orders={orders} value={tab} onChange={(tab) => setParams({ tab })} />{orders.filter((o) => matchesOrder(o,tab)).map((order) => <PaymentOrder key={order.id} order={order} methods={methods} address={address} onSubmitted={submitted} />)}{!loading && <details className="payment-demo"><summary>Sample payment walkthrough</summary><div><FiFileText /><div><h3>Want to try the payment flow?</h3><p>Create a clearly labeled sample order. No transfer is needed. Upload a sample file to see the pending status and download a submission receipt.</p></div><button className="button button-small button-outline" disabled={pending || !!error} onClick={demoOrder}>{pending ? 'Preparing…' : 'Try sample order'}</button></div></details>}</>;
}

export function PaymentOrder({ order, methods, address, onSubmitted }) {
  const confirm = useConfirm();
  const availableMethods = order.demo ? methods : order.settlement?.methods || [];
  const [method, setMethod] = useState(order.settlement?.methods[0]?.id || 'gcash');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [fileName, setFileName] = useState('');
  const selected = availableMethods.find((m) => m.id === method);
  const blocked = !order.demo && (!(selected?.accountNumber || selected?.qrId) || !address);
  async function submit(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget); form.set('method', method);
    const file = form.get('proof');
    if (!file?.size || file.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type)) { setError('Choose a PNG, JPEG, WebP, or PDF file, up to 5 MB.'); return; }
    if (!await confirm({ title: 'Submit this payment proof?', description: 'Your upload will be marked Pending verification. This does not confirm that money has arrived.', details: <p>{order.title}<br />{money(order.amount)} · {selected?.name}<br />Reference: {form.get('reference')}<br />File: {file.name}</p>, confirmLabel: 'Submit proof' })) return;
    setPending(true);
    try { const data = await api(`/account/orders/${order.id}/proof`, { method: 'POST', body: form }); onSubmitted(order.id, data.payment); }
    catch (failure) { setError(failure.message); }
    finally { setPending(false); }
  }
  return <section className="dashboard-panel payment-order"><div className="payment-order-heading"><div><span className="eyebrow">{order.demo ? 'SAMPLE ORDER · NO PAYMENT REQUIRED' : 'Winning auction'}</span><h2>{order.title}</h2><p className="field-hint">Order {order.id}</p></div><strong>{money(order.amount)}</strong></div><OrderActions order={order}  /><OrderFulfillment key={`${order.id}-${order.fulfillment?.status || "pending"}`} order={order} />{order.history?.map((p) => <p key={p.id}>Previous submission: {p.reference} · {p.status} · {p.rejectionReason} <a className="text-link" href={`/api/account/payments/${p.id}/proof`} download>Download previous proof</a></p>)}{order.settlement && <div className="seller-contact"><h3>Contact your seller</h3><p>{order.settlement.contactName}</p><a className="text-link" href={`tel:${order.settlement.phone.replace(/[^+0-9]/g, '')}`}>{order.settlement.phone}</a>{order.settlement.link && <a className="text-link" href={order.settlement.link} target="_blank" rel="noopener noreferrer">Messaging / profile</a>}<p className="field-hint">These contact details were provided by the seller and are not identity verified.</p></div>}{!order.demo && !order.settlement && <p className="notice">The seller needs to complete contact and receiving-account setup before payment can be submitted.</p>}{order.payment && order.payment.status !== 'rejected' ? <><div className="proof-submitted" role="status"><span className="status-badge status-pending">{order.payment.status === 'confirmed' ? 'Paid' : 'Pending verification'}</span><h3>Proof submitted</h3><p>{order.payment.method} · Reference {order.payment.reference}</p><p>Submitted {new Date(order.payment.submittedAt).toLocaleString('en-PH')}</p><p className="field-hint">The receiving account must be checked separately. This upload does not mark the order paid.</p></div><div className="receipt-actions"><a className="button button-small" href={`/api/account/payments/${order.payment.id}/receipt`} download><FiDownload /> Download submission receipt</a><a className="button button-small button-outline" href={`/api/account/payments/${order.payment.id}/proof`} download><FiFileText /> Download uploaded proof</a></div></> : <form onSubmit={submit}>{order.payment?.status === 'rejected' && <p role="alert">Proof rejected: {order.payment.rejectionReason}. Submit replacement proof below.</p>}<fieldset className="method-fieldset"><legend>1. Choose your payment method</legend><div className="payment-methods">{availableMethods.map((m) => <label key={m.id} className={method === m.id ? 'method-option selected' : 'method-option'}><input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} /><span>{m.name}</span></label>)}</div></fieldset>{order.demo ? <div className="notice">This is a sample order. Do not transfer money. Use a sample screenshot or receipt to test the upload.</div> : (selected?.accountNumber || selected?.qrId) ? <div className="transfer-details"><span className="eyebrow">Transfer destination</span><strong>{selected.bankName}</strong><p>{selected.accountName}</p><p className="account-number">{selected.accountNumber}</p>{selected.qrId && <><img className="qr-preview" src={`/api/account/orders/${order.id}/qr/${selected.id}`} alt={`${selected.name} seller payment QR`} /><a className="text-link" href={`/api/account/orders/${order.id}/qr/${selected.id}`} download>Download seller QR</a></>}<span className="field-hint">Transfer exactly {money(order.amount)} using your banking or wallet app, then submit proof below.</span></div> : <div className="notice">The receiving account details for {selected?.name || 'this method'} are not configured. Do not send funds. Try a configured method or the sample order walkthrough.</div>}{address && <div className="payment-shipping"><strong>Shipping to {address.recipient}</strong><p>{address.street}, {address.barangay}, {address.city}, {address.province || address.region} {address.postalCode}</p><Link className="text-link" to="/dashboard/addresses">Edit address</Link></div>}<label htmlFor={`reference-${order.id}`}>2. Transaction reference</label><input id={`reference-${order.id}`} name="reference" required maxLength="100" placeholder={order.demo ? 'SAMPLE-REFERENCE-001' : 'Reference from your payment app'} autoComplete="off" /><label htmlFor={`proof-${order.id}`}>3. Upload screenshot or receipt</label><div className="upload-zone"><FiUpload aria-hidden="true" /><input id={`proof-${order.id}`} name="proof" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required onChange={(e) => setFileName(e.target.files[0]?.name || '')} aria-describedby={`proof-hint-${order.id}`} /><p id={`proof-hint-${order.id}`}>{fileName || 'PNG, JPEG, WebP, or PDF · Up to 5 MB'}</p></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button form-submit" type="submit" disabled={pending || blocked}>{pending ? 'Uploading…' : 'Submit proof for verification'} <FiUpload /></button><p className="field-hint">Proof is stored privately with your account. The submission cannot automatically verify or confirm payment.</p></form>}</section>;
}
