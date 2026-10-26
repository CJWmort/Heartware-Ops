// Straight-line (great-circle) distance in km between two { lat, lng } points.
// FIX: this file used CommonJS (module.exports) inside an ES-module app and exported `haversine` with array inputs,
// but the unit tests import `haversineKm` with { lat, lng } objects. Now it is an ES module with that name.
const EARTH_RADIUS_KM = 6371
const toRad = (deg) => (deg * Math.PI) / 180 // degrees -> radians

export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat) // difference in latitude
  const dLng = toRad(b.lng - a.lng) // difference in longitude
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) // distance in km
}
