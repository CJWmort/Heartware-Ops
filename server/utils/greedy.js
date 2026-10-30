// Greedy matching of volunteers to schools by nearest distance (by volunteer, by pair or by show).

const { haversine } = require("./haversine");

// distanceBetween(a, b) - km between two records that have lat and lng.
function distanceBetween(a, b) {
  return haversine([a.lat, a.lng], [b.lat, b.lng]);
}

// greedyByVolunteer(volunteers, locations) - volunteer-first greedy matching. 1. Remember how many
// places each school has left. 2. Take volunteers in the order given. 3. For each, look at every
// school with space and pick the closest. 4. No school with space -> the volunteer gets nothing. 5.
// Otherwise reduce that school's places and record { volunteer, school, show, distance (km, 2
// decimals) }.
function greedyByVolunteer(volunteers, locations) {
  const spacesLeft = {};
  for (const location of locations) {
    spacesLeft[location._id] = location.p5Classes;
  }

  const pairs = [];
  for (const volunteer of volunteers) {
    let closest = null;
    let closestDistance = Infinity;
    for (const location of locations) {
      if (spacesLeft[location._id] <= 0) {
        continue;
      }
      const distance = distanceBetween(volunteer, location);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = location;
      }
    }

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

// greedyByPair(volunteers, locations) - closest-pair-first greedy matching (the order of volunteers no
// longer matters). 1. Build every (volunteer, school) pair with its distance. 2. Sort pairs shortest
// to longest. 3. Walk down the list; accept a pair when the volunteer has no school yet AND the school
// still has space. 4. Return the accepted pairs in the order they were matched.
function greedyByPair(volunteers, locations) {
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

  allPairs.sort((a, b) => a.distance - b.distance);

  const spacesLeft = {};
  for (const location of locations) {
    spacesLeft[location._id] = location.p5Classes;
  }
  const taken = {};

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

// greedyByShow(volunteers, locations, matcher) - runs a matcher once per show. 1) collect each show
// once 2) for each show keep only volunteers who ticked it and only that show's schools 3) call the
// matcher (greedyByVolunteer by default) 4) join all results.
function greedyByShow(volunteers, locations, matcher = greedyByVolunteer) {
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
