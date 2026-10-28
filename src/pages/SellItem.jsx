import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiArrowUpRight, FiUpload } from 'react-icons/fi';
import { useDemo } from '../state/context';
import { listingDraft } from '../state/listingDraft';
import { api } from '../state/api';
import { money, imageUrlValid } from '../utils/auction';
import { areaLabel } from '../utils/location';
import LocationFields from '../components/LocationFields';
import { useConfirm } from '../components/confirmation/context';
export default function SellItem() {
  const { profile, createAuction, categories } = useDemo(); const confirm = useConfirm(); const navigate = useNavigate();
  const formRef = useRef(null);
  const [draft, setDraft] = useState(null); const [draftReady, setDraftReady] = useState(false); const [draftStatus, setDraftStatus] = useState('');
  const [noIncrement, setNoIncrement] = useState(false);
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  const [settlement, setSettlement] = useState(null); const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState({}); const [category, setCategory] = useState(''); const [duration, setDuration] = useState('3');
  const [file, setFile] = useState(null); const [preview, setPreview] = useState(''); const [urlMode, setUrlMode] = useState(false);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    listingDraft(profile.id).then((saved) => {
      if (!active) return;
      if (saved) { setDraft(saved); setCategory(saved.category || ''); setDuration(saved.duration || '3'); setLocation(saved.location || {}); setFile(saved.file || null); setUrlMode(!!saved.urlMode); setNoIncrement(!!saved.noIncrement); setDraftStatus('Draft restored. Changes are saved automatically on this device.'); }
    }).catch(() => { if (active) setDraftStatus('Draft storage is unavailable. Keep this page open to preserve your work.'); }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [profile]);
  const saveDraft = useCallback(async () => {
    if (!profile || !draftReady || !formRef.current || pending) return false;
    const fields = Object.fromEntries(new FormData(formRef.current));
    try { await listingDraft(profile.id, { fields, category, duration, location, file, urlMode, noIncrement }); setDraftStatus('Draft saved on this device.'); return true; }
    catch { setDraftStatus('Unable to save draft. Keep this page open and try again.'); return false; }
  }, [profile, draftReady, category, duration, location, file, urlMode, noIncrement, pending]);
  useEffect(() => {
    if (!draftReady) return;
    const timer = setTimeout(() => { void saveDraft(); }, 0);
    return () => clearTimeout(timer);
  }, [draftReady, saveDraft]);
  useEffect(() => {
    if (!profile) return;
    let active = true;
    Promise.all([api('/account/seller'), api('/account/address')]).then(([seller, address]) => { if (active) { setSettlement(seller.settings); if (address.address) setLocation((current) => Object.keys(current).length ? current : address.address); } }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [profile]);
  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file); queueMicrotask(() => setPreview(objectUrl));
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  async function submit(event) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget); const values = Object.fromEntries(form);
    const startingPrice = Number(values.startingPrice); const increment = noIncrement ? 0 : Number(values.increment);
    if (!values.title.trim() || !values.description.trim()) return setError('Add a title and description.');
    if (!Number.isSafeInteger(startingPrice) || startingPrice <= 0 || !Number.isSafeInteger(increment) || increment < 0) return setError('Starting price must be positive. Increment must be a whole peso amount.');
    if (urlMode ? !imageUrlValid(values.imageUrl) : !file) return setError('Choose a product photo or enter a valid image URL.');
    if (location.mode !== 'manual' && (!location.cityCode || !location.barangayCode)) return setError('Choose the item’s location.');
    const endsAt = duration === 'custom' ? new Date(values.endsAt).getTime() : undefined;
    if (duration === 'custom' && (!Number.isSafeInteger(endsAt) || endsAt < Date.now() + 300000 || endsAt > Date.now() + 30 * 86400000)) return setError('Choose a deadline between 5 minutes and 30 days from now.');
    const metadata = { title: values.title.trim(), description: values.description.trim(), startingPrice, increment, category: category === 'custom' ? undefined : category, customCategory: category === 'custom' ? values.customCategory.trim() : undefined, duration: duration === 'custom' ? 'custom' : Number(duration), ...(endsAt ? { endsAt } : {}), location, image: urlMode ? values.imageUrl : undefined };
    const deadline = endsAt || Date.now() + Number(duration) * 86400000;
    if (!await confirm({ title: 'Are you sure you want to publish this?', description: 'Review the listing and seller details. Your payment and contact details will be shared only with the winner.', details: <><h3>{metadata.title}</h3><p>Starting price: {money(startingPrice)}<br />Minimum increase: {noIncrement ? 'No increment / N/A' : money(increment)}<br />Category: {metadata.customCategory || categories.find((c) => c.id === category)?.name}<br />Location: {areaLabel(location)}<br />Ends: {new Date(deadline).toLocaleString('en-PH')}<br />Photo: {file?.name || values.imageUrl}</p><p>Seller: {settlement.contactName} · {settlement.phone}<br />Payment methods: {settlement.methods.map((m) => m.name).join(', ')}</p></>, confirmLabel: 'Publish auction' })) return;
    const body = new FormData(); body.set('metadata', JSON.stringify(metadata)); if (file && !urlMode) body.set('image', file);
    setPending(true);
    try { const id = await createAuction(body); await listingDraft(profile.id, null).catch(() => {}); navigate(`/auctions/${id}`); }
    catch (failure) { setError(failure.message); } finally { setPending(false); }
  }
  return <section className="section page-section sell-page"><span className="eyebrow">Pass on something special</span><h1>Your find. Their next favorite.</h1><p className="page-intro">Create an auction with a photo, an item location, and the details your winner needs.</p>{!profile ? <div className="form-panel"><h2>First, introduce yourself</h2><p>Sign in to publish and manage your listings.</p><Link className="button form-submit" to="/signup?returnTo=%2Fsell">Create an account</Link></div> : !draftReady ? <p role="status">Loading your draft…</p> : <form ref={formRef} className="form-panel" onInput={saveDraft} onSubmit={submit}><h2>Listing details</h2>{!loading && !settlement && <div className="notice">Before publishing, <Link className="text-link" to="/dashboard/seller" onClick={async (event) => { event.preventDefault(); if (await saveDraft()) navigate('/dashboard/seller'); }}>set up seller contact and payment details</Link>.</div>}<label htmlFor="item-title">Item title</label><input id="item-title" name="title" defaultValue={draft?.fields?.title || ''} required maxLength="100" /><label htmlFor="item-description">Description</label><textarea id="item-description" name="description" defaultValue={draft?.fields?.description || ''} rows="5" required maxLength="2000" placeholder="Condition, size, and what’s included" /><label htmlFor="item-category">Category</label><select id="item-category" value={category} onChange={(e) => setCategory(e.target.value)} required><option value="">Choose category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="custom">Custom — add a category</option></select>{category === 'custom' && <><label htmlFor="custom-category">New category name</label><input id="custom-category" name="customCategory" defaultValue={draft?.fields?.customCategory || ''} required minLength="2" maxLength="50" placeholder="e.g. Musical instruments" /><p className="field-hint">Your category becomes available when this auction is published.</p></>}<div className="form-columns"><div><label htmlFor="starting-price">Starting price (PHP)</label><input id="starting-price" name="startingPrice" defaultValue={draft?.fields?.startingPrice || ''} type="number" required min="1" step="1" /></div><div><label htmlFor="increment">Increment value (PHP)</label><input id="increment" name="increment" type="number" defaultValue={draft?.fields?.increment || '100'} disabled={noIncrement} required={!noIncrement} min="1" step="1" /><label className="checkbox-label"><input type="checkbox" checked={noIncrement} onChange={(event) => setNoIncrement(event.target.checked)} />No increment / N/A</label><p className="field-hint">Minimum increase after the first bid. With no increment, any higher whole-peso bid is allowed.</p></div></div><h2 className="subsection-heading">Product photo</h2><div className="upload-zone"><FiUpload /><label htmlFor="product-image">Choose file · PNG, JPEG, WebP · up to 5 MB</label><input id="product-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={urlMode} required={!urlMode && !file} onChange={(e) => { const selected = e.target.files[0]; if (selected && (selected.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type))) { setError('Choose a PNG, JPEG, or WebP up to 5 MB.'); e.target.value = ''; setFile(null); return; } setFile(selected || null); setError(''); }} />{file && !urlMode && preview && <><img className="product-preview" src={preview} alt="Product photo preview" /><p>{file.name}</p></>}</div><button className="text-button" type="button" onClick={() => setUrlMode(!urlMode)}>{urlMode ? 'Choose a photo file instead' : 'Use an image URL instead'}</button>{urlMode && <><label htmlFor="image-url">Image URL</label><input id="image-url" name="imageUrl" defaultValue={draft?.fields?.imageUrl || ''} type="url" required maxLength="2048" placeholder="https://…" /></>}<h2 className="subsection-heading">Where is the item?</h2><p className="field-hint">Your city/area will be public. Street and house details will not be included.</p><LocationFields value={location} onChange={setLocation} prefix="item" device /><label htmlFor="item-duration">Auction duration</label><select id="item-duration" value={duration} onChange={(e) => setDuration(e.target.value)}><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="custom">Custom end date and time</option></select>{duration === 'custom' && <><label htmlFor="custom-deadline">End date and time (your local time)</label><input id="custom-deadline" name="endsAt" defaultValue={draft?.fields?.endsAt || ''} type="datetime-local" required /><p className="field-hint">Between 5 minutes and 30 days ahead.</p></>}<div className="notice">{settlement ? <><strong>Seller details ready</strong><p>{settlement.contactName} · {settlement.methods.map((m) => m.name).join(', ')}</p><Link className="text-link" to="/dashboard/seller" onClick={async (event) => { event.preventDefault(); if (await saveDraft()) navigate('/dashboard/seller'); }}>Review seller settings</Link></> : 'Seller contact and payment details are required before publishing.'}</div>{error && <p className="form-error" role="alert">{error}</p>}<p className="field-hint" role="status">{draftStatus}</p><button className="button button-outline form-submit" type="button" onClick={saveDraft}>Save as draft</button><button className="button form-submit" type="submit" disabled={pending || loading || !settlement}>{pending ? 'Publishing…' : 'Review and publish'} <FiArrowUpRight /></button></form>}</section>;
}
