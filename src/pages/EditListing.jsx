import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../state/api';
import { useDemo } from '../state/context';
import { useConfirm } from '../components/confirmation/context';
import AuctionImage from '../components/AuctionImage';
import LocationFields from '../components/LocationFields';
import { areaLabel } from '../utils/location';
import { imageUrlValid, money } from '../utils/auction';
import { localDeadline } from '../utils/datetime';

export default function EditListing() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api(`/account/listings/${id}`).then((result) => { if (active) { setData(result); setError(''); } }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [id, revision]);
  function reload() { setData(null); setError(''); setRevision((value) => value + 1); }
  if (error) return <section className="dashboard-panel"><h1>Listing unavailable</h1><p className="form-error" role="alert">{error}</p><button className="button button-small" onClick={reload}>Try again</button><Link className="text-link" to="/dashboard/listings">My listings</Link></section>;
  if (!data) return <div className="dashboard-panel" role="status">Loading your listing…</div>;
  if (!data.editable) return <section className="dashboard-panel"><h1>This auction has ended.</h1><p className="notice">Ended or settled listings keep their original results and cannot be edited. You can publish a new auction instead.</p><Link className="button button-small" to="/sell">Create a new listing</Link><Link className="text-link" to={`/auctions/${id}`}>View auction</Link></section>;
  return <ListingEditor key={`${id}-${revision}`} initial={data.auction} hasBids={data.hasBids} onReload={reload} />;
}

export function ListingEditor({ initial, hasBids, onReload }) {
  const { categories, updateAuction } = useDemo();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [noIncrement, setNoIncrement] = useState(initial.increment === 0);
  const [category, setCategory] = useState(initial.category);
  const [location, setLocation] = useState(initial.location || {});
  const [changeLocation, setChangeLocation] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const photo = useRef(null);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const options = categories.some((item) => item.id === initial.category) ? categories : [...categories, { id: initial.category, name: initial.categoryName || initial.category }];
  const originalDeadline = localDeadline(initial.endsAt);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    queueMicrotask(() => setPreview(url));
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function submit(event) {
    event.preventDefault(); setError(''); setConflict(false);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    // Preserve seconds/milliseconds when the seller leaves the displayed minute unchanged.
    const endsAt = values.endsAt === originalDeadline ? initial.endsAt : new Date(values.endsAt).getTime();
    if (!Number.isSafeInteger(endsAt)) return setError('Choose a valid end date and time.');
    if (endsAt !== initial.endsAt && (endsAt < Date.now() + 300000 || endsAt > Date.now() + 30 * 86400000)) return setError('The new deadline must be between 5 minutes and 30 days from now.');
    if (hasBids && endsAt < initial.endsAt) return setError('Once bids exist, the deadline can only be extended.');
    const metadata = { revision: initial.revision || 0, endsAt };
    {
      const startingPrice = hasBids ? initial.startingPrice : Number(values.startingPrice); const increment = hasBids ? (initial.increment ?? 1) : noIncrement ? 0 : Number(values.increment);
      if (!values.title.trim() || !values.description.trim()) return setError('Add a title and description.');
      if (!Number.isSafeInteger(startingPrice) || startingPrice <= 0 || !Number.isSafeInteger(increment) || increment < 0) return setError('Starting price must be positive. Increment must be a whole peso amount.');
      if (values.imageUrl.trim() && (!imageUrlValid(values.imageUrl) || file)) return setError('Use either a replacement image file or a valid HTTP(S) image URL.');
      if (changeLocation && location.mode !== 'manual' && (!location.cityCode || !location.barangayCode)) return setError('Choose the updated item location.');
      Object.assign(metadata, { title: values.title.trim(), description: values.description.trim(), ...(!hasBids ? { startingPrice, increment } : {}), ...(category === 'custom' ? { customCategory: values.customCategory.trim() } : { category }), ...(changeLocation ? { location } : {}), ...(values.imageUrl.trim() ? { image: values.imageUrl.trim() } : {}) });
    }
    const format = (time) => new Date(time).toLocaleString('en-PH', { timeZoneName: 'short' });
    if (!await confirm({ title: 'Save changes to this listing?', description: hasBids ? 'Existing bidders will be notified of listing changes. Starting price and increment remain fixed.' : 'Review the listing and the updated end date before saving.', details: <><h3>{metadata.title || initial.title}</h3><p>Previous deadline: {format(initial.endsAt)}<br />New deadline: {format(endsAt)}</p><p>Starting price: {money(metadata.startingPrice ?? initial.startingPrice)}<br />Increment: {(metadata.increment ?? initial.increment) === 0 ? 'No increment / N/A' : money(metadata.increment ?? initial.increment)}<br />Photo: {file?.name || metadata.image || 'Keep current photo'}<br />Item area: {areaLabel(changeLocation ? location : initial.location)}</p></>, confirmLabel: 'Save listing changes' })) return;
    const body = new FormData(); body.set('metadata', JSON.stringify(metadata)); if (file) body.set('image', file);
    setPending(true);
    try { await updateAuction(initial.id, body); navigate(`/auctions/${initial.id}`, { state: { listingUpdated: true } }); }
    catch (failure) { setError(failure.message); setConflict(failure.status === 409); }
    finally { setPending(false); }
  }
  return <><div className="dashboard-heading"><span className="eyebrow">Keep your listing up to date</span><h1>Edit listing</h1><p className="muted">{initial.title}</p></div><Link className="back-link" to="/dashboard/listings">← Back to my listings</Link><form className="dashboard-panel" onSubmit={submit}>
    {hasBids && <div className="notice"><strong>Bidding has started.</strong><p>You can update item details and photos, and extend the end date. Starting price and increment remain fixed. Bidders will be notified of your changes.</p><p>Current bid: {money(initial.currentBid)} · {initial.bids.length} bids</p></div>}<>
      <label htmlFor="edit-title">Item title</label><input id="edit-title" name="title" defaultValue={initial.title} required maxLength="100" />
      <label htmlFor="edit-description">Description</label><textarea id="edit-description" name="description" defaultValue={initial.description} required maxLength="2000" rows="5" />
      <label htmlFor="edit-category">Category</label><select id="edit-category" value={category} onChange={(event) => setCategory(event.target.value)} required>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="custom">Custom — add a category</option></select>
      {category === 'custom' && <><label htmlFor="edit-custom-category">New category name</label><input id="edit-custom-category" name="customCategory" required minLength="2" maxLength="50" /></>}
      <div className="form-columns"><div><label htmlFor="edit-price">Starting price (PHP)</label><input id="edit-price" name="startingPrice" disabled={hasBids} defaultValue={initial.startingPrice} type="number" required min="1" step="1" /></div><div><label htmlFor="edit-increment">Increment value (PHP)</label><input id="edit-increment" name="increment" defaultValue={initial.increment || 100} type="number" disabled={hasBids || noIncrement} required={!noIncrement} min="1" step="1" /><label className="checkbox-label"><input type="checkbox" disabled={hasBids} checked={noIncrement} onChange={(event) => setNoIncrement(event.target.checked)} />No increment / N/A</label></div></div>
      <h2 className="subsection-heading">Product photo</h2><div className="listing-current-photo">{file && preview ? <img src={preview} alt="Replacement product photo preview" /> : <AuctionImage src={initial.image} alt={initial.title} />}</div>
      <label htmlFor="edit-photo">Replace photo (optional) · PNG, JPEG, WebP · up to 5 MB</label><input id="edit-photo" ref={photo} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const selected = event.target.files[0]; if (selected && (selected.size > 5 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(selected.type))) { setError('Choose a PNG, JPEG, or WebP file up to 5 MB.'); event.target.value = ''; setFile(null); return; } setFile(selected || null); }} />
      {file && <button type="button" className="text-button" onClick={() => { setFile(null); if (photo.current) photo.current.value = ''; }}>Keep current photo</button>}
      <label htmlFor="edit-image-url">Or use a replacement image URL (optional)</label><input id="edit-image-url" name="imageUrl" type="url" maxLength="2048" placeholder="https://…" />
      <h2 className="subsection-heading">Item location</h2><p className="field-hint">{areaLabel(initial.location)}</p><label className="checkbox-label form-submit"><input type="checkbox" checked={changeLocation} onChange={(event) => setChangeLocation(event.target.checked)} />Change item location</label>{changeLocation && <LocationFields value={location} onChange={setLocation} prefix="edit-location" device />}
    </>
    <h2 className="subsection-heading">End date and time</h2><label htmlFor="edit-deadline">Auction ends (your local time)</label><input id="edit-deadline" name="endsAt" type="datetime-local" defaultValue={originalDeadline} required /><p className="field-hint">New deadlines must be between 5 minutes and 30 days ahead.{hasBids && ' The new deadline must not be earlier than the current deadline.'}</p>
    {error && <p className="form-error" role="alert">{error}</p>}{conflict && <button type="button" className="text-button" onClick={onReload}>Reload the latest listing</button>}
    <div className="listing-edit-actions"><button type="submit" className="button" disabled={pending}>{pending ? 'Saving…' : 'Review and save changes'}</button><Link className="button button-outline" to={`/auctions/${initial.id}`}>Cancel</Link></div>
  </form></>;
}
