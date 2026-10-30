// Fills open places from the reserve list with the nearest reserve volunteers.

const Assignments = require('../models/assignments-model');
const Account = require('../models/account-model');
const { haversine } = require('./haversine');

const NEARBY_KM = 10;

// distanceKm(school, person) - straight-line distance in km between a school and a volunteer, rounded
// to 2 decimals.
function distanceKm(school, person) {
  return Number(haversine([school.lat, school.lng], [person.lat, person.lng]).toFixed(2));
}

// replaceFromReserve(show) - fills open places of a PUBLISHED show from its reserve list. 1. Draft
// show -> do nothing. 2. Load the open places and the reserves; either empty -> do nothing. 3. For
// each open place rank every reserve by distance (nearest first). 4. Handle places with the FEWEST
// nearby reserves (within 10 km) first, so a hard-to-reach school is not left with only far-away
// people. 5. For each place take reserves in order; skip anyone already placed in this run; try
// fillFromReserve (Reserve -> Pending). 6. "full" = someone else took the last place: give the person
// back to the pool and move on. "taken" = they were placed elsewhere: try the next person. 7. Return
// every row that was filled.
async function replaceFromReserve(show) {
  const published = await Assignments.publishedShows();
  if (!published.includes(show)) return [];

  const [places, reserves] = await Promise.all([Assignments.findOpenPlaces(show), Assignments.findReserves(show)]);
  if (places.length === 0 || reserves.length === 0) return [];

  const ranked = places.map((p) => ({
    ...p,
    candidates: reserves
      .map((r) => ({ ...r, distanceKm: distanceKm(p.school, r) }))
      .sort((a, b) => a.distanceKm - b.distanceKm),
  }));
  // nearby(p) - how many candidate volunteers are within the nearby distance of an open place.
  const nearby = (p) => p.candidates.filter((c) => c.distanceKm <= NEARBY_KM).length;
  ranked.sort((a, b) => nearby(a) - nearby(b));

  const used = new Set();
  const filled = [];
  for (const place of ranked) {
    let open = place.open;
    for (const person of place.candidates) {
      if (open === 0) break;
      const key = String(person.rowId);
      if (used.has(key)) continue;
      used.add(key);

      const result = await Assignments.fillFromReserve(person.rowId, place.school._id, person.distanceKm);
      if (result.assignment) {
        filled.push(result.assignment);
        open--;
      } else if (result.problem === 'full') {
        used.delete(key);
        break;
      }
    }
  }
  return filled;
}

// topUpPublishedShow(show) - for a published show, adds volunteers who signed up late. 1) find
// volunteers who already have a row 2) find signed-up volunteers without one (and with coordinates) 3)
// give each a published Reserve row 4) run replaceFromReserve 5) return { added, placed } = how many
// newcomers were added and how many of them got a school.
async function topUpPublishedShow(show) {
  const hasRow = new Set((await Assignments.volunteerIdsWithRow(show)).map(String));

  const newcomers = (await Account.findVolunteersByShow(show)).filter(
    (v) => !hasRow.has(String(v._id)) && typeof v.lat === 'number' && typeof v.lng === 'number',
  );
  if (newcomers.length === 0) return { added: 0, placed: 0 };

  await Assignments.createMany(
    newcomers.map((v) => ({
      volunteer: v._id, school: null, name: v.name, show,
      distance: null, status: 'Reserve', published: true,
    })),
  );

  const filled = await replaceFromReserve(show);
  const newIds = new Set(newcomers.map((v) => String(v._id)));
  const placed = filled.filter((row) => newIds.has(String(row.volunteer))).length;
  return { added: newcomers.length, placed };
}

module.exports = { replaceFromReserve, topUpPublishedShow, NEARBY_KM };
