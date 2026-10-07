// F1b (Fanny) – distance between two points on Earth in kilometres.
// Used by allocation (nearest volunteers) and replacement (radius search).
//
// a and b look like: { lat: 1.3521, lng: 103.8198 }
//
// TODO(Fanny): implement the haversine formula.
// The unit tests in client/src/utils/__tests__/haversine.spec.js describe the expected results.
// (The client has its own copy in client/src/utils/haversine.js for the map UI.)
function haversineKm(a, b) {
  throw new Error(`haversineKm not implemented yet (called with ${JSON.stringify([a, b])})`)
}

module.exports = { haversineKm }
