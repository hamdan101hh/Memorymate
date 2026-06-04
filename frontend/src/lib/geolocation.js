/**
 * Best-effort browser geolocation. Resolves to { lat, lng, label } or null.
 * Never throws — location is always optional and privacy-first.
 */
export function getCurrentLocation(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        resolve({ lat, lng, label: `${lat}, ${lng}` });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

export function mapsUrl(loc) {
  if (!loc || loc.lat == null || loc.lng == null) return null;
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
}
