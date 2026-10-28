import { useState } from 'react';
import { FiMapPin } from 'react-icons/fi';
import { useDemo } from '../state/context';
import { api } from '../state/api';
import { areaLabel, distanceKm } from '../utils/location';
export default function AuctionDistance({ auction }) {
  const { demoMode } = useDemo();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function locate() {
    if (!navigator.geolocation) return setMessage('Device location is unavailable.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        const result = demoMode ? { distanceKm: distanceKm(point, auction.demoCoordinates) } : await api(`/auctions/${auction.id}/distance`, { method: 'POST', body: point });
        setMessage(result.distanceKm === null ? 'The seller has not added a device location. The item area is shown above.' : `Approximately ${result.distanceKm < 1 ? 'less than 1' : result.distanceKm} km away in a straight line. Travel distance may be longer.`);
      } catch (error) { setMessage(error.message); }
      finally { setBusy(false); }
    }, () => { setBusy(false); setMessage('Location access was denied or unavailable. You can still view the item’s area above.'); }, { timeout: 12000, maximumAge: 60000 });
  }
  return <div className="auction-location"><p><FiMapPin aria-hidden="true" /> {areaLabel(auction.location)}</p>{(auction.hasDistance || auction.demoCoordinates) && <button className="text-button" type="button" disabled={busy} onClick={locate}>{busy ? 'Calculating…' : 'Use my location to estimate distance'}</button>}<p className="field-hint" role="status">{message}</p></div>;
}
