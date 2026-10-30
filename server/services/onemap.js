// Talks to the OneMap service: log in for a token, search addresses, convert postal codes to places
// and get routes.

const axios = require('axios');

const cache = {}
let token = null

// login() - gets a fresh OneMap token. 1) POST the OneMap email and password from config.env 2) save
// access_token in `token`.
async function login() {
  const body = {
    email: process.env.ONEMAP_API_EMAIL,
    password: process.env.ONEMAP_API_PASSWORD,
  }
  const res = await axios.post(`${process.env.ONEMAP_BASE_URL}/api/auth/post/getToken`, body)
  token = res.data.access_token
}

// search(postalCode, addrDetails) - calls OneMap's search endpoint with the current token. addrDetails
// "Y" also returns the full address text. Returns the axios promise.
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

// reverseSearch(lat, lng) - OneMap "what is at this lat/lng?" (within 30 metres). Returns the axios
// promise.
function reverseSearch(lat, lng) {
  const config = {
    params: {
      location: `${lat},${lng}`,
      buffer: 30,
      addressType: 'All',
    },
    headers: {
      Authorization: token,
    },
  }
  return axios.get(`${process.env.ONEMAP_BASE_URL}/api/public/revgeocode`, config)
}

// geocodePostal(postalCode) - postal code -> { lat, lng }. 1) return the cached answer if there is one
// 2) log in if there is no token 3) search; on a 401 (token expired) log in again and retry once 4)
// first result -> parse its LATITUDE/LONGITUDE numbers, cache and return them 5) no result -> null 6)
// any failure -> throw "Failed to fetch from OneMap".
async function geocodePostal(postalCode) {
  if (cache[postalCode]) return cache[postalCode]

  try {
    if (!token) await login()

    let res
    try {
      res = await search(postalCode)
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login()
      res = await search(postalCode)
    }

    const hit = res.data.results?.[0]
    if (!hit) return null

    cache[postalCode] = { lat: parseFloat(hit.LATITUDE), lng: parseFloat(hit.LONGITUDE) }

    return cache[postalCode]
  } catch (error) {
    throw new Error('Failed to fetch from OneMap', { cause: error })
  }
}

// getRoute(start, end, routeType) - directions. 1) the request is built inside call() so it always
// uses the CURRENT token 2) log in first if there is no token 3) on 401 log in again and retry once 4)
// return OneMap's data 5) failure -> throw "OneMap routing failed (status)".
async function getRoute(start, end, routeType) {
    // the token is read on EVERY call. It used to be copied into the request once, before login(), so
    // the first route after a server start was sent with no token, failed with 401 twice, and the
    // volunteer saw an error.
    const call = () =>
      axios.get(`${process.env.ONEMAP_BASE_URL}/api/public/routingsvc/route`, {
        params: { start, end, routeType },
        headers: { Authorization: token },
      });

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

// lookupPostal(postalCode) - registration form: postal code -> { address, lat, lng }. 1) log in if
// needed 2) search with full address details (retry once on 401) 3) pick the result whose POSTAL
// equals the code exactly (the search may also return nearby places) 4) strip the trailing "SINGAPORE
// 123456" from the address 5) no match -> null.
async function lookupPostal(postalCode) {
  try {
    if (!token) await login()

    let res
    try {
      res = await search(postalCode, 'Y')
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login()
      res = await search(postalCode, 'Y')
    }

    const hit = res.data.results?.find((r) => r.POSTAL === postalCode)
    if (!hit) return null

    return {
      address: hit.ADDRESS.replace(/\s*SINGAPORE\s+\d{6}$/i, '').trim(),
      lat: parseFloat(hit.LATITUDE),
      lng: parseFloat(hit.LONGITUDE),
    }
  } catch (error) {
    throw new Error(`OneMap failed (${error.response?.status || error.message})`)
  }
}

// searchAddress(text) - registration form: typed address -> up to 5 matches. 1) log in if needed and
// search (retry once on 401) 2) drop results with no postal code 3) map to { address, postal, lat, lng
// } 4) remove duplicates (same address + postal) 5) keep the first 5.
async function searchAddress(text) {
  try {
    if (!token) await login()

    let res
    try {
      res = await search(text, 'Y')
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login()
      res = await search(text, 'Y')
    }

    const seen = new Set()
    return (res.data.results || [])
      .filter((r) => r.POSTAL && r.POSTAL !== 'NIL')
      .map((r) => ({
        address: r.ADDRESS.replace(/\s*SINGAPORE\s+\d{6}$/i, '').trim(),
        postal: r.POSTAL,
        lat: parseFloat(r.LATITUDE),
        lng: parseFloat(r.LONGITUDE),
      }))
      .filter((r) => {
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

// reverseGeocode(lat, lng) - GPS -> readable address for incident reports. 1) log in if needed and ask
// OneMap (retry once on 401) 2) no result -> null 3) join BLOCK, ROAD, POSTALCODE and BUILDINGNAME,
// skipping empty or "NIL" parts 4) return the text or null.
async function reverseGeocode(lat, lng) {
  try {
    if (!token) await login()

    let res
    try {
      res = await reverseSearch(lat, lng)
    } catch (err) {
      if (err.response?.status !== 401) throw err
      await login()
      res = await reverseSearch(lat, lng)
    }

    const found = res.data.GeocodeInfo?.[0]
    if (!found) return null
    const addressParts = [found.BLOCK, found.ROAD, found.POSTALCODE, found.BUILDINGNAME]
    const address = addressParts.filter((part) => part && part !== 'NIL').join(' ')
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