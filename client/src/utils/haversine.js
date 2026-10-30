// Calculates the straight-line distance in kilometres between two points on the earth.

const EARTH_RADIUS_KM = 6371
// toRad(deg) - converts degrees to radians.
const toRad = (deg) => (deg * Math.PI) / 180

// haversineKm(a, b) - straight-line distance in km between two { lat, lng } points. 1) differences in
// latitude and longitude (converted to radians) 2) haversine formula 3) multiply by the Earth's
// radius.
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
