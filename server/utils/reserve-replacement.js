// Automatic replacements. When a volunteer declines or withdraws, their school place opens. This fills it
// straight away with the NEAREST volunteer on that show's reserve list, so the admin does not have to do anything.
// Nobody who already has a school is moved; only a Reserve row becomes Pending.
//
// If several places are open at once, the place with the FEWEST reserves nearby (within NEARBY_KM) picks first,
// so a hard-to-reach school is not left with only far-away people (same idea as scarcity-first).
// There is no distance limit: the nearest reserve is placed even if far, because an empty place is worse.
const Assignments = require('../models/assignments-model');
const Account = require('../models/account-model'); // NEW: needed to find volunteers who signed up late
const { haversine } = require('./haversine');

const NEARBY_KM = 10;

// Distance in km (2 decimals) from a school to a reserve volunteer
function distanceKm(school, person) {
  return Number(haversine([school.lat, school.lng], [person.lat, person.lng]).toFixed(2));
}

// Fill every open place of one show from its reserve list. Returns the rows that were filled.
// Draft (unpublished) shows are skipped: the next Run Allocations fills those.
async function replaceFromReserve(show) {
  const published = await Assignments.publishedShows();
  if (!published.includes(show)) return [];

  const [places, reserves] = await Promise.all([Assignments.findOpenPlaces(show), Assignments.findReserves(show)]);
  if (places.length === 0 || reserves.length === 0) return [];

  // Each place gets its reserves sorted nearest first; the place with the fewest nearby reserves goes first
  const ranked = places.map((p) => ({
    ...p,
    candidates: reserves
      .map((r) => ({ ...r, distanceKm: distanceKm(p.school, r) }))
      .sort((a, b) => a.distanceKm - b.distanceKm),
  }));
  const nearby = (p) => p.candidates.filter((c) => c.distanceKm <= NEARBY_KM).length;
  ranked.sort((a, b) => nearby(a) - nearby(b));

  const used = new Set(); // reserves already placed in this run
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
        used.delete(key); // FIX: they were put back on Reserve, so another school in this run may still use them
        break; // someone else filled this school at the same moment: it has no open place left
      }
      // "taken": that person was placed elsewhere at the same moment, so try the next nearest
    }
  }
  return filled;
}

// NEW: for a PUBLISHED show, add volunteers who signed up late as Reserve rows, then let replaceFromReserve
// place them into any open places. Nobody who already has a school is moved.
// Returns { added, placed }: how many late volunteers were added and how many of them got a school.
async function topUpPublishedShow(show) {
  // everyone who already has a row in this show (already handled, so skipped)
  const hasRow = new Set((await Assignments.volunteerIdsWithRow(show)).map(String));

  // volunteers signed up for the show, with no row yet, and with a home location (needed to measure distance)
  const newcomers = (await Account.findVolunteersByShow(show)).filter(
    (v) => !hasRow.has(String(v._id)) && typeof v.lat === 'number' && typeof v.lng === 'number',
  );
  if (newcomers.length === 0) return { added: 0, placed: 0 };

  // one Reserve row each; published: true because this show is already live
  await Assignments.createMany(
    newcomers.map((v) => ({
      volunteer: v._id, school: null, name: v.name, show,
      distance: null, status: 'Reserve', published: true,
    })),
  );

  // existing logic: nearest reserve -> open place (the row becomes Pending + fromReserve)
  const filled = await replaceFromReserve(show);
  // count only the NEWCOMERS that got a school (replaceFromReserve may also place older reserves)
  const newIds = new Set(newcomers.map((v) => String(v._id)));
  const placed = filled.filter((row) => newIds.has(String(row.volunteer))).length;
  return { added: newcomers.length, placed };
}

module.exports = { replaceFromReserve, topUpPublishedShow, NEARBY_KM };
