// Scarcity-first volunteer matching (JavaScript port)

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

// Straight-line distance over the earth's surface, in km. Points are [lat, lon].
function haversine(a, b) {
  const lat1 = toRad(a[0]);
  const lon1 = toRad(a[1]);
  const lat2 = toRad(b[0]);
  const lon2 = toRad(b[1]);
  const h =
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// volunteers: { V1: [lat, lon], ... }
// locations:  { A: { pos: [lat, lon], need: 2 }, ... }
// returns:    { A: ["V1", "V2"], ... }
function scarcityFirst(volunteers, locations) {
  // `{ ...obj }` makes a shallow copy of an object. We work on copies so that
  // deleting volunteers/locations below doesn't change the objects passed in.
  const free = { ...volunteers }; // volunteers not yet assigned
  const todo = { ...locations }; // locations not yet filled

  // Start every location with an empty list of volunteers:
  //   { A: [], B: [], C: [] }
  const result = {};
  for (const locationName of Object.keys(locations)) {
    result[locationName] = [];
  }

  while (Object.keys(todo).length > 0 && Object.keys(free).length > 0) {
    // Calculates the scarcity value of a location: the average of the shortest
    // `need` distances from free volunteers to that location.
    // Higher means harder to serve.
    const scarcity = (loc) => {
      const locationPos = todo[loc].pos;

      // 1. Get the [lat, lon] of every volunteer who is still free.
      //    e.g. [[1.31, 103.76], [1.33, 103.80], ...]
      const freePositions = Object.values(free);

      // 2. Turn each position into a distance (km) to this location.
      //    e.g. [3.1, 6.5, 12.5, ...]
      const distances = [];
      for (const p of freePositions) {
        distances.push(haversine(p, locationPos));
      }

      // 3. Sort the distances from smallest to largest.
      //    (x - y sorts numbers in ascending order)
      distances.sort((x, y) => x - y);

      // 4. We only want the nearest `need` distances.
      //    Math.min stops us asking for more volunteers than are left.
      const k = Math.min(todo[loc].need, distances.length);

      // 5. Add up the first k distances (the smallest ones).
      let total = 0;
      for (let i = 0; i < k; i++) {
        total += distances[i];
      }

      // 6. Divide by k to get the average.
      return total / k;
    };

    // Pick the most scarce location (re-scored every round).
    let loc = null;
    let best = -Infinity;
    for (const l of Object.keys(todo)) {
      const s = scarcity(l);
      if (s > best) {
        best = s;
        loc = l;
      }
    }

    // Give it its nearest free volunteers.
    // Sort the free volunteers' IDs from closest to farthest.
    const sortedIds = Object.keys(free);
    sortedIds.sort(
      (a, b) =>
        haversine(free[a], todo[loc].pos) - haversine(free[b], todo[loc].pos)
    );

    // Take the first `need` IDs (or fewer, if not enough volunteers are left).
    const count = Math.min(todo[loc].need, sortedIds.length);
    const nearest = [];
    for (let i = 0; i < count; i++) {
      nearest.push(sortedIds[i]);
    }

    for (const v of nearest) {
      result[loc].push(v);
      delete free[v];
    }
    delete todo[loc];
  }

  return result;
}

module.exports = { haversine, scarcityFirst };

// Demo: run with `node scarcityFirst.js`
if (require.main === module) {
  const volunteers = {
    V1: [1.3151, 103.7649],
    V2: [1.3294, 103.8021],
    V3: [1.3343, 103.8563],
    V4: [1.3526, 103.8352],
    V5: [1.3496, 103.9568],
    V6: [1.302, 103.907],
  };
  const locations = {
    A: { pos: [1.3329, 103.7436], need: 2 },
    B: { pos: [1.3048, 103.8318], need: 2 },
    C: { pos: [1.3644, 103.9915], need: 1 },
  };

  const result = scarcityFirst(volunteers, locations);
  console.log(result);

  let total = 0;
  for (const [loc, vols] of Object.entries(result)) {
    for (const v of vols) total += haversine(volunteers[v], locations[loc].pos);
  }
  console.log(`Total distance: ${total.toFixed(2)} km`);
}
