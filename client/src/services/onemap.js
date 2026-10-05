// OneMap (external API) – live address preview on the registration form. Owner: Kuah (F1a)
// Docs: https://www.onemap.gov.sg/apidocs/   (Search API needs no key)
// The SERVER does the real geocoding when saving; this is only for the "📍 Found: ..." preview.
import axios from 'axios'

export const ONEMAP_SEARCH_URL = 'https://www.onemap.gov.sg/api/common/elastic/search'

// TODO(Kuah): call ONEMAP_SEARCH_URL with params
//   { searchVal: postalCode, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: 1 }
// and return { address, lat, lng } for the first result, or null if none.
// Tip: debounce calls (wait ~400 ms after the user stops typing) to avoid spamming the API.
export async function searchPostalCode(postalCode) {
  void axios // remove this line once you use axios
  throw new Error(`searchPostalCode not implemented yet (postal code ${postalCode})`)
}
