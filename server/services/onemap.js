// OneMap (external API) – live address preview on the registration form. Owner: Kuah (F1a)
// Docs: https://www.onemap.gov.sg/apidocs/   (Search API needs no key)
// The SERVER does the real geocoding when saving; this is only for the "📍 Found: ..." preview.
// test
// TODO(Kuah): call ONEMAP_SEARCH_URL with params
//   { searchVal: postalCode, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: 1 }
// and return { address, lat, lng } for the first result, or null if none.
// Tip: debounce calls (wait ~400 ms after the user stops typing) to avoid spamming the API.
// export async function searchPostalCode(postalCode) {
//   void axios // remove this line once you use axios
//   throw new Error(`searchPostalCode not implemented yet (postal code ${postalCode})`)
// }

const axios = require('axios');

// Documentation: https://www.onemap.gov.sg/apidocs/docs/tokenmanagement

const cache = {} // key:postal code, value:{ lat, lng }
let token = null

// Fetch a fresh token
async function login() {
  const body = {
    email: process.env.ONEMAP_API_EMAIL,
    password: process.env.ONEMAP_API_PASSWORD,
  }
  const res = await axios.post(`${process.env.ONEMAP_BASE_URL}/api/auth/post/getToken`, body)
  token = res.data.access_token
}

// Hit the search endpoint for OneMap API
function search(postalCode, addrDetails = 'N') {
  const body = {
    params: {
      searchVal: postalCode,
      returnGeom: 'Y',
      getAddrDetails: addrDetails,
      pageNum: 1,
    },
    headers: {
      Authorization: token,
    },
  }
  return axios.get(`${process.env.ONEMAP_BASE_URL}/api/common/elastic/search`, body)
}

// Ask OneMap: "what is at this lat/lng?" implemented for incident report as the user geolocation will be used to get the address
function reverseSearch(lat, lng) {
  const config = {
    params: {
      location: `${lat},${lng}`, // OneMap wants ONE string: "1.304,103.8746"
      buffer: 30, // look within 30 metres
      addressType: 'All',
    },
    headers: {
      Authorization: token, // same login token Kuah's search() uses
    },
  }
  return axios.get(`${process.env.ONEMAP_BASE_URL}/api/public/revgeocode`, config)
}

// Token is fetched when needed, remembered with its expiry, renewed automatically.
// If token rejected (401), refresh and retry once.
async function geocodePostal(postalCode) {
  if (cache[postalCode]) return cache[postalCode]

  try {
    if (!token) await login()

    let res
    try {
      res = await search(postalCode)
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login() // token expired: log in again
      res = await search(postalCode)
    }

    const hit = res.data.results?.[0]
    if (!hit) return null

    // Cache the geolocations so we dont have to
    // keep hitting OneMap API endpoint everytime we refresh the page
    cache[postalCode] = { lat: parseFloat(hit.LATITUDE), lng: parseFloat(hit.LONGITUDE) }

    return cache[postalCode]
  } catch (error) {
    throw new Error('Failed to fetch from OneMap', { cause: error })
  }
}

async function getRoute(start, end, routeType) {
    const body = {
      params: { start, end, routeType }, // start/end are "lat,lng" strings
      headers: { Authorization: token },
    }
    const call = () => axios.get(`${process.env.ONEMAP_BASE_URL}/api/public/routingsvc/route`, body);

    try {
        if (!token) await login();
        try {
            return (await call()).data;
        } catch (err) {
            if (err.response?.status !== 401) throw err;
            await login();
            return (await call()).data;
        }
    } catch (error) {
        throw new Error(`OneMap routing failed (${error.response?.status || error.message})`, { cause: error });
    }
}

// ---------- Registration form: postal code -> address (added by Kuah) ----------
async function lookupPostal(postalCode) {
  try {
    if (!token) await login()

    let res
    try {
      res = await search(postalCode, 'Y')
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login() // token expired: log in again
      res = await search(postalCode, 'Y')
    }

    // A postal code search can also return nearby places, so pick the exact match
    const hit = res.data.results?.find((r) => r.POSTAL === postalCode)
    if (!hit) return null

    return {
      // "123 ANG MO KIO AVENUE 3 SINGAPORE 560123" -> "123 ANG MO KIO AVENUE 3"
      address: hit.ADDRESS.replace(/\s*SINGAPORE\s+\d{6}$/i, '').trim(),
      lat: parseFloat(hit.LATITUDE),
      lng: parseFloat(hit.LONGITUDE),
    }
  } catch (error) {
    throw new Error(`OneMap failed (${error.response?.status || error.message})`)
  }
}

// ---------- Registration form: address text -> list of matching places (added by Kuah) ----------
// e.g. "ang mo kio ave 3" -> [{ address, postal, lat, lng }, ...]  (top 5)
async function searchAddress(text) {
  try {
    if (!token) await login()

    let res
    try {
      res = await search(text, 'Y')
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login() // token expired: log in again
      res = await search(text, 'Y')
    }

    const seen = new Set()
    return (res.data.results || [])
      .filter((r) => r.POSTAL && r.POSTAL !== 'NIL') // skip roads/places with no postal code
      .map((r) => ({
        address: r.ADDRESS.replace(/\s*SINGAPORE\s+\d{6}$/i, '').trim(),
        postal: r.POSTAL,
        lat: parseFloat(r.LATITUDE),
        lng: parseFloat(r.LONGITUDE),
      }))
      .filter((r) => {
        // remove duplicates (same building can appear more than once)
        const key = r.address + r.postal
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 5)
  } catch (error) {
    throw new Error(`OneMap failed (${error.response?.status || error.message})`)
  }
}

// ---------- Incident Report form usage, reverseGeocode using lat, long to get address, postal code for incident report
async function reverseGeocode(lat, lng) {
  try {
    if (!token) await login() // 1. no token yet? log in first

    let res
    try {
      res = await reverseSearch(lat, lng) // 2. ask OneMap
    } catch (err) {
      if (err.response?.status !== 401) throw err // a real error → give up
      await login() // 401 = token expired → log in again
      res = await reverseSearch(lat, lng) //   …and try once more
    }

    console.log(res.data) // 👈 TEMPORARY: so we can see what OneMap sends back

    // Piece 3 goes here
    const found = res.data.GeocodeInfo?.[0] // checks
    if (!found) return null // if nothing found from onemap, return null
    const addressParts = [found.BLOCK, found.ROAD, found.POSTALCODE, found.BUILDINGNAME]
    const address = addressParts.filter((part) => part && part !== 'NIL').join(' ') // any found.xxx is NIL will be skipped
    console.log(address)
    return address || null
  } catch (error) {
    throw new Error(`OneMap reverse geocode failed (${error.response?.status || error.message})`)
  }
}

module.exports = {
  geocodePostal,
  getRoute,
  lookupPostal,
  searchAddress,
  reverseGeocode,
};