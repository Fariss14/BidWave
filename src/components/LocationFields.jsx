import { useEffect, useState } from 'react';
import { api } from '../state/api';
import { coarseCoordinates } from '../utils/location';
let directoryPromise;
function loadDirectory() {
  if (!directoryPromise) directoryPromise = api('/locations/tree').catch((error) => { directoryPromise = null; throw error; });
  return directoryPromise;
}
export default function LocationFields({ value, onChange, prefix = 'location', device = false }) {
  const [tree, setTree] = useState(null);
  const [barangays, setBarangays] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [deviceMessage, setDeviceMessage] = useState('');
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    let active = true;
    loadDirectory().then((data) => { if (active) { setTree(data); setError(''); } }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => {
    if (!value.cityCode) return;
    let active = true;
    api(`/locations/barangays?city=${encodeURIComponent(value.cityCode)}`).then((data) => { if (active) { setBarangays(data.barangays); setBusy(false); setError(''); } }).catch((failure) => { if (active) { setError(failure.message); setBusy(false); } });
    return () => { active = false; };
  }, [value.cityCode, revision]);
  const city = tree?.cities.find((c) => c.code === value.cityCode);
  const regionCode = value.regionCode || city?.region.code || '';
  const provinceCode = value.provinceCode ?? (city ? city.province?.code || '_none' : '');
  const provinces = tree?.provinces.filter((p) => p.regionCode === regionCode) || [];
  const independent = tree?.cities.some((c) => c.region.code === regionCode && !c.province);
  const cities = tree?.cities.filter((c) => c.region.code === regionCode && (provinceCode === '_none' ? !c.province : c.province?.code === provinceCode)) || [];
  function chooseCity(code) {
    const selected = tree.cities.find((c) => c.code === code);
    setBarangays([]); setBusy(!!code);
    onChange({ ...value, cityCode: code, city: selected?.name || '', region: selected?.region.name || value.region, province: selected?.province?.name || '', barangayCode: '', barangay: '', coordinates: null });
  }
  function locate() {
    if (!navigator.geolocation) { setDeviceMessage('Device location is unavailable. You can still choose the item area.'); return; }
    setLocating(true); setDeviceMessage('');
    navigator.geolocation.getCurrentPosition((position) => { onChange({ ...value, coordinates: coarseCoordinates(position.coords) }); setDeviceMessage('Approximate device location added. Confirm that the item is here before publishing.'); setLocating(false); }, () => { setDeviceMessage('Location permission was denied or the position could not be found. Choose the area using the dropdowns.'); setLocating(false); }, { timeout: 12000, maximumAge: 60000, enableHighAccuracy: false });
  }
  const manual = value.mode === 'manual';
  const manualChange = (event) => onChange({ ...value, [event.target.name]: event.target.value });
  return <div className="location-fields">{manual ? <><p className="notice">Use this if your area is missing or has been renamed. Review the full address before saving.</p><div className="form-columns"><div><label htmlFor={`${prefix}-manual-region`}>Region</label><input id={`${prefix}-manual-region`} name="region" required maxLength="100" value={value.region || ''} onChange={manualChange} /></div><div><label htmlFor={`${prefix}-manual-province`}>Province (if applicable)</label><input id={`${prefix}-manual-province`} name="province" maxLength="100" autoComplete="shipping address-level1" value={value.province || ''} onChange={manualChange} /></div></div><div className="form-columns"><div><label htmlFor={`${prefix}-manual-city`}>City / municipality</label><input id={`${prefix}-manual-city`} name="city" required maxLength="100" autoComplete="shipping address-level2" value={value.city || ''} onChange={manualChange} /></div><div><label htmlFor={`${prefix}-manual-barangay`}>Barangay</label><input id={`${prefix}-manual-barangay`} name="barangay" required maxLength="100" autoComplete="shipping address-level3" value={value.barangay || ''} onChange={manualChange} /></div></div></> : <>
    <div className="form-columns"><div><label htmlFor={`${prefix}-region`}>Region</label><select id={`${prefix}-region`} value={regionCode} required disabled={!tree} onChange={(e) => { const region = tree.regions.find((r) => r.code === e.target.value); onChange({ ...value, regionCode: e.target.value, region: region?.name || '', provinceCode: '', province: '', cityCode: '', city: '', barangayCode: '', barangay: '', coordinates: null }); setBarangays([]); }}><option value="">{tree ? 'Choose region' : 'Loading address directory…'}</option>{tree?.regions.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}</select></div><div><label htmlFor={`${prefix}-province`}>Province / area</label><select id={`${prefix}-province`} value={provinceCode} required disabled={!regionCode || !tree} onChange={(e) => { const province = provinces.find((p) => p.code === e.target.value); onChange({ ...value, provinceCode: e.target.value, province: province?.name || '', cityCode: '', city: '', barangayCode: '', barangay: '', coordinates: null }); setBarangays([]); }}><option value="">Choose province / area</option>{provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}{independent && <option value="_none">Independent city / no province</option>}</select></div></div>
    <div className="form-columns"><div><label htmlFor={`${prefix}-city`}>City / municipality</label><select id={`${prefix}-city`} value={value.cityCode || ''} required disabled={!provinceCode || !tree} onChange={(e) => chooseCity(e.target.value)}><option value="">Choose city / municipality</option>{cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></div><div><label htmlFor={`${prefix}-barangay`}>Barangay</label><select id={`${prefix}-barangay`} value={value.barangayCode || ''} required disabled={!value.cityCode || busy} onChange={(e) => { const b = barangays.find((item) => item.code === e.target.value); onChange({ ...value, barangayCode: b?.code || '', barangay: b?.name || '' }); }}><option value="">{busy ? 'Loading barangays…' : 'Choose barangay'}</option>{barangays.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select></div></div>
    {value.cityCode && tree && !city && <p className="notice">This saved address uses an older geographic code. Please reselect its region, province/area, city, and barangay when updating it.</p>}
    {error && <div className="notice" role="alert">{error} <button type="button" className="text-button" onClick={() => { setRevision(revision + 1); setBusy(!!value.cityCode); }}>Retry</button></div>}
    </>}<button type="button" className="text-button" onClick={() => onChange({ ...value, mode: manual ? 'directory' : 'manual', cityCode: '', barangayCode: '', regionCode: '', provinceCode: '' })}>{manual ? 'Use cascading dropdowns' : 'Cannot find your area? Enter manually'}</button>
    {device && <div className="device-location"><button type="button" className="button button-small button-outline" disabled={locating} onClick={locate}>{locating ? 'Finding location…' : value.coordinates ? 'Update item device location' : 'Use my location for this item'}</button>{value.coordinates && <button type="button" className="text-button" onClick={() => { onChange({ ...value, coordinates: null }); setDeviceMessage('Approximate device location removed.'); }}>Remove device location</button>}<p className="field-hint" role="status">{deviceMessage || 'Optional: add an approximate location so bidders can estimate distance. Exact device coordinates are not stored.'}</p></div>}
  </div>;
}
