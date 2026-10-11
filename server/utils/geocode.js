// Turns Singapore postal codes into [lat, lon] using the OneMap search API.
// Needs Node 18+ (for the built-in `fetch`).
//
// If OneMap asks for a token, set it in the environment before running:
//   ONEMAP_TOKEN=your_token node run.js

const ONEMAP_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

// Looks up ONE postal code. Returns [lat, lon], or null if it can't be found.
async function geocodePostal(postalCode, token) {
  const url = `${ONEMAP_URL}?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=N&pageNum=1`;
  const headers = {};
  if (token) {
    headers.Authorization = token;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    return null;
  }

  // OneMap sends the coordinates as text, so convert them to numbers.
  const first = data.results[0];
  return [Number(first.LATITUDE), Number(first.LONGITUDE)];
}

// Takes a list of records that each have a `postalCode`, e.g.
//   [{ _id: "...", name: "Charl", postalCode: "793472", address: "..." }, ...]
// and returns two lists:
//   located: the same records with two extra fields, `lat` and `lng`
//   failed:  records whose postal code could not be found
async function addPositions(records, token) {
  const cache = {}; // postal code -> [lat, lon] (or null), so repeats are only looked up once
  const located = [];
  const failed = [];

  for (const record of records) {
    const code = record.postalCode;

    if (!(code in cache)) {
      cache[code] = await geocodePostal(code, token);
    }

    // Mongoose documents hide their fields inside internal properties, so
    // copying one with `{ ...record }` would give garbage. toObject() turns it
    // into a plain object first. Plain objects are used as they are.
    const plain = typeof record.toObject === "function" ? record.toObject() : record;

    if (cache[code] === null) {
      failed.push(plain);
    } else {
      located.push({ ...plain, lat: cache[code][0], lng: cache[code][1] });
    }
  }

  return { located, failed };
}

module.exports = { geocodePostal, addPositions };
