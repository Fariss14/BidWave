import { useEffect, useState } from 'react';
import { FiMapPin } from 'react-icons/fi';
import { useDemo } from '../state/context';
import { api } from '../state/api';
import LocationFields from '../components/LocationFields';
import { useConfirm } from '../components/confirmation/context';
export default function Addresses() {
  const { profile } = useDemo(); const confirm = useConfirm();
  const [saved, setSaved] = useState(null);
  const [values, setValues] = useState({ recipient: profile.name, phone: '', street: '', postalCode: '', cityCode: '', barangayCode: '' });
  const [loading, setLoading] = useState(true); const [pending, setPending] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { let active = true; api('/account/address').then((data) => { if (active && data.address) { setSaved(data.address); setValues(data.address); } }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (values.mode !== 'manual' && (!values.cityCode || !values.barangayCode)) return setError('Choose the address region, province/area, city, and barangay.');
    if (!await confirm({ title: 'Save this shipping address?', description: 'This address will be filled in for future payment submissions.', details: <p>{values.recipient}<br />{values.street}, {values.barangay}, {values.city}<br />{values.province || values.region} {values.postalCode}</p>, confirmLabel: 'Save address' })) return;
    setPending(true);
    try { const data = await api('/account/address', { method: 'PUT', body: { ...values, mode: values.mode === 'manual' ? 'manual' : 'directory' } }); setSaved(data.address); setMessage('Shipping address saved.'); }
    catch (failure) { setError(failure.message); } finally { setPending(false); }
  }
  async function remove() {
    if (!await confirm({ title: 'Remove your saved address?', description: 'Existing payment submissions will retain their shipping address snapshot.', confirmLabel: 'Remove address' })) return;
    setPending(true);
    try { await api('/account/address', { method: 'DELETE' }); setSaved(null); setMessage('Saved address removed.'); }
    catch (failure) { setError(failure.message); } finally { setPending(false); }
  }
  const change = (e) => setValues({ ...values, [e.target.name]: e.target.value });
  return <><div className="dashboard-heading"><span className="eyebrow">Less typing, more discovering</span><h1>Shipping address</h1><p className="muted">Choose your Philippine address from cascading dropdowns. This directory is stored locally and needs no map account or API key.</p></div>{saved && <section className="saved-address dashboard-panel"><FiMapPin /><div><span className="status-badge status-positive">Saved address</span><h3>{saved.recipient}</h3><p>{saved.street}<br />{saved.barangay}, {saved.city}<br />{saved.province || saved.region} {saved.postalCode} · {saved.phone}</p></div><button className="text-button" disabled={pending} onClick={remove}>Remove address</button></section>}<form className="dashboard-panel" autoComplete="on" onSubmit={submit}><h2>{saved ? 'Update address' : 'Set up your address'}</h2><div className="form-columns"><div><label htmlFor="recipient">Recipient name</label><input id="recipient" name="recipient" required maxLength="100" autoComplete="shipping name" value={values.recipient} onChange={change} /></div><div><label htmlFor="phone">Contact number</label><input id="phone" name="phone" type="tel" required maxLength="30" autoComplete="shipping tel" value={values.phone} onChange={change} /></div></div><LocationFields value={values} onChange={setValues} prefix="shipping" /><label htmlFor="street">House / unit, building, street</label><input id="street" name="street" required maxLength="200" autoComplete="shipping street-address" value={values.street} onChange={change} /><p className="field-hint">Use browser autofill for your exact street or unit, then confirm the details.</p><label htmlFor="postal-code">Postal code</label><input id="postal-code" name="postalCode" required maxLength="4" pattern="[0-9]{4}" inputMode="numeric" autoComplete="shipping postal-code" value={values.postalCode} onChange={change} />{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button type="submit" className="button form-submit" disabled={pending || loading}>{pending ? 'Saving…' : 'Save shipping address'}</button></form></>;
}
