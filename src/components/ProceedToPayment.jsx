import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../state/api';
import { PaymentOrder } from '../pages/Payments';

export default function ProceedToPayment({ auctionId }) {
  const dialog = useRef(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!open) return;
    if (!dialog.current.open) dialog.current.showModal();
    let active = true;
    Promise.all([api('/account/orders'), api('/payment-methods'), api('/account/address')]).then(([orders, methods, address]) => {
      if (active) {
        const order = orders.orders.find((item) => item.auctionId === auctionId);
        if (!order) setError('Your winning order is not ready yet. Please try again.');
        else { setData({ order, methods: methods.methods, address: address.address }); setError(''); }
      }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [open, auctionId, attempt]);
  return <><button type="button" className="button button-small" onClick={() => setOpen(true)}>Proceed to payment</button>{open && <dialog ref={dialog} className="confirm-dialog payment-dialog" aria-label="Pay for your winning auction" onClose={() => { setOpen(false); setData(null); setError(''); }}><button className="button button-small button-outline" type="button" autoFocus onClick={() => dialog.current.close()}>Close</button>{error ? <p role="alert">{error} <button type="button" className="text-button" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Try again</button></p> : !data ? <p role="status">Loading payment details…</p> : <>{!data.address && <p className="notice"><Link className="text-link" to="/dashboard/addresses">Add your shipping address</Link> before submitting payment proof.</p>}<PaymentOrder {...data} onSubmitted={(_, payment) => setData((current) => ({ ...current, order: { ...current.order, payment } }))} /></>}<Link className="text-link" to="/dashboard/payments">View all payments</Link></dialog>}</>;
}
