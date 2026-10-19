// Scarcity-first volunteer matching.
//
// volunteers: [{ _id, name, postalCode, address, lat, lng }, ...]
// locations:  [{ _id, name, postalCode, address, zone, lat, lng, p5Classes, ... }, ...]
// returns:    [{ volunteer, school, show, distance }, ...]
//             the same field names as the Assignments model:
//             volunteer = volunteer _id, school = school _id,
//             show = the school's show (e.g. "NE Show 4"), distance = km.
//             `status` is left out so the model's default ("reserve") applies.
//             one record for each (volunteer, school) pair that was matched.
//             After those, one record for each volunteer who got no school,
//             using the `show` argument (the show this run is for):
//             { volunteer, school: null, show, distance: null }.
// show:       the show name this run is for (e.g. "NE Show 1").
//             Schools left short simply have fewer records.

const { haversine } = require("./haversine");

// Distance in km between any two records that have `lat` and `lng`.
function distanceBetween(a, b) {
  return haversine([a.lat, a.lng], [b.lat, b.lng]);
}

// True if the value is a real, finite number (rejects undefined, null, "", NaN, Infinity).
// Numeric strings such as "1.39" are rejected on purpose: they usually mean
// the data was not parsed properly.
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// Check every record up front so bad data fails loudly instead of turning
// into NaN distances that quietly break sorting and scoring.
// Throws one Error listing every problem found.
function validateInputs(volunteers, locations, show) {
  const problems = [];

  if (typeof show !== "string" || show.trim() === "") {
    problems.push("show: missing or not a non-empty string");
  }

  for (const volunteer of volunteers) {
    const label = `volunteer ${volunteer._id} (${volunteer.name})`;
    if (!isFiniteNumber(volunteer.lat) || !isFiniteNumber(volunteer.lng)) {
      problems.push(`${label}: lat/lng missing or not a number`);
    } else if (Math.abs(volunteer.lat) > 90 || Math.abs(volunteer.lng) > 180) {
      problems.push(`${label}: lat/lng out of range`);
    }
  }

  for (const location of locations) {
    const label = `location ${location._id} (${location.name})`;
    if (!isFiniteNumber(location.lat) || !isFiniteNumber(location.lng)) {
      problems.push(`${label}: lat/lng missing or not a number`);
    } else if (Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) {
      problems.push(`${label}: lat/lng out of range`);
    }
    if (!isFiniteNumber(location.p5Classes) || location.p5Classes < 0) {
      problems.push(`${label}: p5Classes missing or not a non-negative number`);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `scarcityFirst: invalid input (${problems.length} problem(s)):\n- ` +
        problems.join("\n- ")
    );
  }
}

// Scarcity score of a location: the average of the shortest `need` distances
// from the free volunteers to that location. Higher means harder to serve.
function scarcityScore(location, freeVolunteers) {
  // 1. Distance from every free volunteer to this location.
  const distances = [];
  for (const volunteer of freeVolunteers) {
    distances.push(distanceBetween(volunteer, location));
  }

  // 2. Sort from smallest to largest.
  distances.sort((x, y) => x - y);

  // 3. Only look at the nearest `need` (or fewer, if not enough volunteers are left).
  const k = Math.min(location.p5Classes, distances.length);

  // 4. Average of those k distances.
  let total = 0;
  for (let i = 0; i < k; i++) {
    total += distances[i];
  }
  return total / k;
}

function scarcityFirst(volunteers, locations, show) {
  validateInputs(volunteers, locations, show);

  // Work on copies so the lists passed in are not changed.
  let freeVolunteers = [];
  for (const volunteer of volunteers) {
    freeVolunteers.push(volunteer);
  }

  // Locations still waiting to be filled (skip any that need nobody).
  let todo = [];
  for (const location of locations) {
    if (location.p5Classes > 0) {
      todo.push(location);
    }
  }

  // Volunteers assigned so far, keyed by location _id.
  const assigned = {};
  for (const location of locations) {
    assigned[location._id] = [];
  }

  while (todo.length > 0 && freeVolunteers.length > 0) {
    // Re-score every remaining location and find the most scarce one.
    let scarcestIndex = 0;
    let highestScore = -Infinity;
    for (let i = 0; i < todo.length; i++) {
      const score = scarcityScore(todo[i], freeVolunteers);
      if (score > highestScore) {
        highestScore = score;
        scarcestIndex = i;
      }
    }
    const location = todo[scarcestIndex];

    // Sort a copy of the free volunteers from closest to farthest.
    const sorted = [];
    for (const volunteer of freeVolunteers) {
      sorted.push(volunteer);
    }
    sorted.sort(
      (a, b) => distanceBetween(a, location) - distanceBetween(b, location)
    );

    // The closest `need` volunteers go to this location.
    const count = Math.min(location.p5Classes, sorted.length);
    for (let i = 0; i < count; i++) {
      assigned[location._id].push(sorted[i]);
    }

    // Everyone after them in the sorted list is still free.
    const stillFree = [];
    for (let i = count; i < sorted.length; i++) {
      stillFree.push(sorted[i]);
    }
    freeVolunteers = stillFree;

    // This location is done, so take it off the todo list.
    const stillTodo = [];
    for (let i = 0; i < todo.length; i++) {
      if (i !== scarcestIndex) {
        stillTodo.push(todo[i]);
      }
    }
    todo = stillTodo;
  }

  // Build one record per (volunteer, school) pair, school by school in the
  // same order as the locations passed in.
  const pairs = [];
  for (const location of locations) {
    for (const volunteer of assigned[location._id]) {
      pairs.push({
        volunteer: volunteer._id,
        school: location._id,
        name: volunteer.name,
        show: location.show,
        distance: Number(distanceBetween(volunteer, location).toFixed(2)),
      });
    }
  }

  // Add the volunteers who are still free, meaning they never got a school.
  // Results are keyed on (volunteer, show), so each one gets a record for the
  // show this run is for. They have no school and so no distance, so those
  // two are null.
  for (const volunteer of freeVolunteers) {
    pairs.push({
      volunteer: volunteer._id,
      school: null,
      show,
      distance: null,
      status: "Reserve"
    });
  }
  return pairs;
}

module.exports = { scarcityFirst };

// Demo: run with `node scarcityFirst.js`
// (the volunteers and schools are sample records in the same shape as your database)
if (require.main === module) {
  const volunteers = [
    { _id: "6ac61321828145318364e844", name: "Charl", postalCode: "793472", address: "Blk 723C Hougang", lat: 1.39631552198212, lng: 103.881167314758 },
    { _id: "6ac7c0be3fde38de8f5356d2", name: "bob", postalCode: "458663", address: "fernvale", lat: 1.31156925662723, lng: 103.931221767023 },
    { _id: "6ac7d0a296568cd5bc18fd24", name: "chea", postalCode: "547291", address: "Blk 232D Fernvale Street", lat: 1.3608345651974, lng: 103.8785795299 },
    { _id: "6ac9f254c22ff8db436f25e0", name: "Tan Wei Ming", postalCode: "642988", address: "988B JURONG WEST STREET 93", lat: 1.33619079679783, lng: 103.695792447164 },
    { _id: "6aca0058c22ff8db436f25e9", name: "Lim Chin Song", postalCode: "610118", address: "118 CORPORATION DRIVE", lat: 1.33538115974341, lng: 103.722906605661 },
    { _id: "6acaea116b4d496f668e0dbe", name: "Chin Jun Wen", postalCode: "793472", address: "472C FERNVALE STREET FERNVALE RIVERGROVE", lat: 1.39631552198212, lng: 103.881167314758 },
  ];
  const locations = [
    { _id: "6ac9eb467d500bef729c747e", name: "Admiralty Primary School", address: "11 Woodlands Circle", postalCode: "738907", zone: "NORTH", lat: 1.442635, lng: 103.80004, p5Classes: 4, reportingTime: "1:30pm", show: "NE Show 4" },
    { _id: "6ac9eb467d500bef729c747f", name: "Ahmad Ibrahim Primary School", address: "10 Yishun Street 11", postalCode: "768643", zone: "NORTH", lat: 1.433153, lng: 103.832942, p5Classes: 6, reportingTime: "1:45pm", show: "NE Show 1" },
    { _id: "6ac9eb467d500bef729c7480", name: "Ai Tong School", address: "100 Bright Hill Drive", postalCode: "579646", zone: "SOUTH", lat: 1.360583, lng: 103.83302, p5Classes: 4, reportingTime: "3:00pm", show: "NE Show 4" },
    { _id: "6ac9eb467d500bef729c7481", name: "Alexandra Primary School", address: "2A Prince Charles Crescent", postalCode: "159016", zone: "SOUTH", lat: 1.291334, lng: 103.824425, p5Classes: 4, reportingTime: "3:30pm", show: "NE Show 2" },
    { _id: "6ac9eb467d500bef729c7482", name: "Anchor Green Primary School", address: "31 Anchorvale Drive", postalCode: "544969", zone: "NORTH", lat: 1.39037, lng: 103.887165, p5Classes: 4, reportingTime: "2:30pm", show: "NE Show 1" },
  ];

  const show = "NE Show 1";
  const result = scarcityFirst(
    volunteers,
    locations.filter((l) => l.show === show),
    show
  );
  console.log(result);
}