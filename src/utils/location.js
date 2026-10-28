export function validCoordinates(value) {
  return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}
export function coarseCoordinates(value) {
  return validCoordinates(value) ? { latitude: Math.round(value.latitude * 100) / 100, longitude: Math.round(value.longitude * 100) / 100 } : null;
}
export function distanceKm(a, b) {
  if (!validCoordinates(a) || !validCoordinates(b)) return null;
  const rad = (v) => v * Math.PI / 180;
  const latitude = rad(b.latitude - a.latitude);
  const longitude = rad(b.longitude - a.longitude);
  const h = Math.sin(latitude / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))));
}
export const areaLabel = (location) => location?.city ? [location.city, location.province || location.region].filter(Boolean).join(', ') : 'Location not provided';
