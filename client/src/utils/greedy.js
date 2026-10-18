// Greedy (volunteer-first) matching.
//
// Same inputs and outputs as scarcityFirst.js:
// volunteers: [{ _id, name, ..., lat, lng, availableShows }, ...]
// locations:  [{ _id, name, ..., lat, lng, p5Classes, show }, ...]
//             volunteers needed = `p5Classes` (every location must have it)
// returns:    [{ volunteer, school, show, distance }, ...]
//             one record per matched volunteer, in the order the volunteers
//             were given. `distance` is in km.
//
// How it works: take the volunteers one at a time, in the order given, and
// send each to the closest school that still has space.

const { haversine } = require("./haversine");

// Distance in km between any two records that have `lat` and `lng`.
function distanceBetween(a, b) {
  return haversine([a.lat, a.lng], [b.lat, b.lng]);
}

function greedyByVolunteer(volunteers, locations) {
  // How many spaces each location has left (its p5Classes), keyed by location _id.
  const spacesLeft = {};
  for (const location of locations) {
    spacesLeft[location._id] = location.p5Classes;
  }

  const pairs = [];
  for (const volunteer of volunteers) {
    // Find the closest location that still has a space.
    let closest = null;
    let closestDistance = Infinity;
    for (const location of locations) {
      if (spacesLeft[location._id] <= 0) {
        continue; // this location is already full
      }
      const distance = distanceBetween(volunteer, location);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = location;
      }
    }

    // Every location is full, so this volunteer gets no school.
    if (closest === null) {
      continue;
    }

    spacesLeft[closest._id] -= 1;
    pairs.push({
      volunteer: volunteer._id,
      school: closest._id,
      show: closest.show,
      distance: Number(closestDistance.toFixed(2)),
    });
  }
  return pairs;
}

// Greedy (closest-pair-first) matching. Same inputs and outputs as above.
//
// How it works: work out the distance for every possible (volunteer, school)
// pair, sort them from shortest to longest, then go down the list. A pair is
// accepted if the volunteer has no school yet and the school still has a
// space. So the single closest pair across everyone is always matched first,
// and the order of the volunteer list no longer matters.
// Records come back in the order they were matched (shortest distance first).
function greedyByPair(volunteers, locations) {
  // 1. Every possible pair with its distance.
  const allPairs = [];
  for (const volunteer of volunteers) {
    for (const location of locations) {
      allPairs.push({
        volunteer: volunteer,
        location: location,
        distance: distanceBetween(volunteer, location),
      });
    }
  }

  // 2. Shortest distance first.
  allPairs.sort((a, b) => a.distance - b.distance);

  // 3. Walk down the list, accepting each pair that still works.
  const spacesLeft = {};
  for (const location of locations) {
    spacesLeft[location._id] = location.p5Classes;
  }
  const taken = {}; // volunteers who already have a school, keyed by _id

  const pairs = [];
  for (const candidate of allPairs) {
    const volunteerId = candidate.volunteer._id;
    const locationId = candidate.location._id;

    if (taken[volunteerId] || spacesLeft[locationId] <= 0) {
      continue;
    }

    taken[volunteerId] = true;
    spacesLeft[locationId] -= 1;
    pairs.push({
      volunteer: volunteerId,
      school: locationId,
      show: candidate.location.show,
      distance: Number(candidate.distance.toFixed(2)),
    });
  }
  return pairs;
}

// Runs a matching function once for each show, so that a school is only
// matched with volunteers who listed its show in `availableShows`, and a
// volunteer gets at most one school per show.
// `matcher` is greedyByVolunteer by default; pass greedyByPair to use the
// closest-pair-first version: greedyByShow(volunteers, locations, greedyByPair)
function greedyByShow(volunteers, locations, matcher = greedyByVolunteer) {
  // Collect each show once, in the order the schools list them.
  const shows = [];
  const seen = {};
  for (const location of locations) {
    if (!seen[location.show]) {
      seen[location.show] = true;
      shows.push(location.show);
    }
  }

  const pairs = [];
  for (const show of shows) {
    const availableVolunteers = [];
    for (const volunteer of volunteers) {
      const available = volunteer.availableShows || [];
      if (available.includes(show)) {
        availableVolunteers.push(volunteer);
      }
    }

    const showLocations = [];
    for (const location of locations) {
      if (location.show === show) {
        showLocations.push(location);
      }
    }

    const showPairs = matcher(availableVolunteers, showLocations);
    for (const pair of showPairs) {
      pairs.push(pair);
    }
  }
  return pairs;
}

module.exports = { greedyByVolunteer, greedyByPair, greedyByShow };
