// Calculates the straight-line distance in kilometres between two points on the earth.

const EARTH_RADIUS_KM = 6371;
// toRad(deg) - converts degrees to radians.
const toRad = (deg) => (deg * Math.PI) / 180;
// haversine(a, b) - great-circle (straight-line over the Earth) distance in km between two points
// given as [lat, lng]. 1) convert degrees to radians 2) apply the haversine formula 3) multiply by the
// Earth's radius (6371 km).
function haversine(a, b) {
  const lat1 = toRad(a[0]);
  const lon1 = toRad(a[1]);
  const lat2 = toRad(b[0]);
  const lon2 = toRad(b[1]);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

module.exports = {haversine};