// Turns Singapore postal codes into [lat, lon] using the OneMap search API.
// Needs Node 18+ (for the built-in `fetch`).
//
// If OneMap asks for a token, set it in the environment before running:
//   ONEMAP_TOKEN=your_token node run.js

const ONEMAP_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

const onemap = require("../../client/src/services/onemap");



// Takes a list of records that each have a `postalCode`, e.g.
//   [{ _id: "...", name: "Charl", postalCode: "793472", address: "..." }, ...]
// and returns two lists:
//   located: the same records with two extra fields, `lat` and `lng`
//   failed:  records whose postal code could not be found
async function addPositions(records) {
  const cache = {}; // postal code -> [lat, lon] (or null), so repeats are only looked up once
  const located = [];
  const failed = [];

  for (const record of records) {
    const code = record.postalCode;

    if (!(code in cache)) {
      cache[code] = await onemap.geocodePostal(code);
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

module.exports = { addPositions };
