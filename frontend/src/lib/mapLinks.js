/** Free map deep links — no Google Maps/Places API. */
export function googleMapsSearchUrl(location) {
  if (!location?.trim()) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}

export function wazeSearchUrl(location) {
  if (!location?.trim()) return "";
  return `https://waze.com/ul?q=${encodeURIComponent(location.trim())}&navigate=yes`;
}

export function formatCoordsLabel(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (Number.isNaN(la) || Number.isNaN(ln)) return "";
  return `Current location coordinates (${la.toFixed(5)}, ${ln.toFixed(5)})`;
}
