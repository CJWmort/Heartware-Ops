// Helpers for storing locations in MongoDB as GeoJSON points.
// MongoDB stores [longitude, latitude] (lng first!) – these helpers stop us mixing them up.

function toPoint(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] }
}

function fromPoint(point) {
  if (!point || !point.coordinates) return null
  const [lng, lat] = point.coordinates
  return { lat, lng }
}

module.exports = { toPoint, fromPoint }
