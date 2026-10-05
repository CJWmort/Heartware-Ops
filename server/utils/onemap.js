// OneMap geocoding (external API). Owner: Kuah (F1a)
// Docs: https://www.onemap.gov.sg/apidocs/  – the Search API needs no API key.
//
// Call this ONCE when a volunteer registers, then store the result in MongoDB.
// Do not call it on every page load (rate limits + the graders test 5-6 times a day).

const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search'

// TODO(Kuah): fetch `${ONEMAP_SEARCH_URL}?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`
// using the built-in fetch(), pick the first result, and return
//   { lat: Number(result.LATITUDE), lng: Number(result.LONGITUDE), address: result.ADDRESS }
// Return null if there are no results (invalid postal code).
async function geocodePostalCode(postalCode) {
  throw new Error(`geocodePostalCode not implemented yet (postal code ${postalCode})`)
}

module.exports = { geocodePostalCode, ONEMAP_SEARCH_URL }
