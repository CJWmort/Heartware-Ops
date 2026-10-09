// OneMap (external API) – live address preview on the registration form. Owner: Kuah (F1a)
// Docs: https://www.onemap.gov.sg/apidocs/   (Search API needs no key)
// The SERVER does the real geocoding when saving; this is only for the "📍 Found: ..." preview.

// TODO(Kuah): call ONEMAP_SEARCH_URL with params
//   { searchVal: postalCode, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: 1 }
// and return { address, lat, lng } for the first result, or null if none.
// Tip: debounce calls (wait ~400 ms after the user stops typing) to avoid spamming the API.
// export async function searchPostalCode(postalCode) {
//   void axios // remove this line once you use axios
//   throw new Error(`searchPostalCode not implemented yet (postal code ${postalCode})`)
// }

import axios from 'axios'

// Documentation: https://www.onemap.gov.sg/apidocs/docs/tokenmanagement

const cache = {}; // key:postal code, value:{ lat, lng }
let token = null;

// Fetch a fresh token
async function login() {
    const res = await axios.post(`${process.env.ONEMAP_BASE_URL}/api/auth/post/getToken`, {
        email: process.env.ONEMAP_API_EMAIL,
        password: process.env.ONEMAP_API_PASSWORD,
    });
    token = res.data.access_token;
}

// Hit the search endpoint for OneMap API 
function search(postalCode) {
    return axios.get(`${process.env.ONEMAP_BASE_URL}/api/common/elastic/search`, {
        params: { searchVal: postalCode, returnGeom: 'Y', getAddrDetails: 'N', pageNum: 1 },
        headers: { Authorization: token },
    });
}

// Token is fetched when needed, remembered with its expiry, renewed automatically.
// If token rejected (401), refresh and retry once.
export async function geocodePostal (postalCode) {
    if (cache[postalCode]) return cache[postalCode];

    try {
        if (!token) await login();

        let res;
        try {
            res = await search(postalCode);
        } catch (err) {
            if (err.response?.status !== 401) throw err;
            await login(); // token expired: log in again
            res = await search(postalCode);
        }

        const hit = res.data.results?.[0];
        if (!hit) return null;

        // Cache the geolocations so we dont have to 
        // keep hitting OneMap API endpoint everytime we refresh the page
        cache[postalCode] = { lat: parseFloat(hit.LATITUDE), lng: parseFloat(hit.LONGITUDE) };

        return cache[postalCode];
    } catch (error) {
        throw new Error(`OneMap failed (${error.response?.status || error.message})`);
    }
};

