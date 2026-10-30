// The main allocation method: schools and volunteers that are hardest to match are matched first, then
// the rest by distance.

const { haversine } = require("./haversine");

// distanceBetween(a, b) - km between two records that have lat and lng.
function distanceBetween(a, b) {
  return haversine([a.lat, a.lng], [b.lat, b.lng]);
}

// isFiniteNumber(value) - true only for real numbers (not null, "", NaN, Infinity or numeric text like
// "1.39").
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

// validateInputs(volunteers, locations, show) - stops bad data BEFORE matching. 1) show must be a
// non-empty string 2) every volunteer needs numeric lat/lng in range 3) every school needs numeric
// lat/lng in range and p5Classes >= 0 4) any problem -> throw ONE error listing them all.
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

// scarcityScore(location, freeVolunteers) - how hard a school is to staff (higher = harder). 1)
// distance from every free volunteer to the school 2) sort ascending 3) keep the nearest k (k = places
// needed, or fewer if not enough volunteers) 4) return the average of those k distances.
function scarcityScore(location, freeVolunteers) {
  const distances = [];
  for (const volunteer of freeVolunteers) {
    distances.push(distanceBetween(volunteer, location));
  }

  distances.sort((x, y) => x - y);

  const k = Math.min(location.p5Classes, distances.length);

  let total = 0;
  for (let i = 0; i < k; i++) {
    total += distances[i];
  }
  return total / k;
}

// scarcityFirst(volunteers, locations, show) - the main allocation algorithm. Step by step: 1.
// Validate the inputs. 2. Copy the volunteer list (the caller's list is never changed); keep schools
// that need at least 1 person in a "todo" list. 3. Repeat while there are schools to fill AND free
// volunteers: re-score every remaining school, pick the MOST scarce one, give it its nearest free
// volunteers (as many as it needs), remove those volunteers and the school from the lists. 4. Build
// one record per matched pair { volunteer, school, name, show, distance (km, 2 decimals) }. 5. Every
// volunteer still free gets a Reserve record (no school, no distance). 6. Return all records.
function scarcityFirst(volunteers, locations, show) {
  validateInputs(volunteers, locations, show);

  let freeVolunteers = [];
  for (const volunteer of volunteers) {
    freeVolunteers.push(volunteer);
  }

  let todo = [];
  for (const location of locations) {
    if (location.p5Classes > 0) {
      todo.push(location);
    }
  }

  const assigned = {};
  for (const location of locations) {
    assigned[location._id] = [];
  }

  while (todo.length > 0 && freeVolunteers.length > 0) {
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

    const sorted = [];
    for (const volunteer of freeVolunteers) {
      sorted.push(volunteer);
    }
    sorted.sort(
      (a, b) => distanceBetween(a, location) - distanceBetween(b, location)
    );

    const count = Math.min(location.p5Classes, sorted.length);
    for (let i = 0; i < count; i++) {
      assigned[location._id].push(sorted[i]);
    }

    const stillFree = [];
    for (let i = count; i < sorted.length; i++) {
      stillFree.push(sorted[i]);
    }
    freeVolunteers = stillFree;

    const stillTodo = [];
    for (let i = 0; i < todo.length; i++) {
      if (i !== scarcestIndex) {
        stillTodo.push(todo[i]);
      }
    }
    todo = stillTodo;
  }

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

  for (const volunteer of freeVolunteers) {
    pairs.push({
      volunteer: volunteer._id,
      school: null,
      name: volunteer.name,
      show,
      distance: null,
      status: "Reserve"
    });
  }
  return pairs;
}

module.exports = { scarcityFirst };

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