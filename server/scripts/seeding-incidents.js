// seeding-incidents.js - adds realistic demo incidents to the "incidents" collection.
//   pnpm run seed:incidents              adds them (replaces the demo incidents from an earlier run)
//   pnpm run seed:incidents -- --remove  deletes the demo incidents again
// Only incidents whose slotId starts with "seed-" are ever deleted, so real reports are safe.
// It needs volunteers who are already assigned to schools (run Allocations on the admin board first).

const mongoose = require("mongoose");
const { connect, disconnect } = require("./_connect");
const schedule = require("../data/schedule.json"); // show name -> date (used if the shows collection is empty)
require("../models/account-model");
require("../models/assignments-model");
require("../models/schools-model");
require("../models/shows-model");
require("../models/incidents-model");

const COUNT = 60; // how many incidents to create (more pins = a clearer spread on the map)
const PADANG = { lat: 1.2905591, lng: 103.8529176 }; // the venue (same point the client uses)

// One entry per incident type: how often it happens (weight), how severe it is (same as the report page), what HQ would
// write when it is fixed, and what the volunteer would write at each PLACE it can happen:
//   school = at the volunteer's own school (spread all over Singapore), road = on the bus between the school and the Padang,
//   padang = at the venue. {school} and {bus} are filled in.
const KINDS = [
  {
    type: "STUDENT_UNWELL",
    severity: "high",
    weight: 28,
    notes: {
      padang: [
        "A P5 student from {school} ({bus}) feels dizzy from the heat. We moved her to the shade and she is sipping water. Please send a medic.",
        "A student on {bus} ({school}) vomited and says his stomach hurts. He is conscious and a teacher is with him. Requesting first aid.",
      ],
      school: [
        "A P5 student at {school} ({bus}) has a fever and a sore throat before boarding. The teacher-in-charge knows. Not sure if she should join the trip. Please advise.",
      ],
      road: [
        "A student on {bus} ({school}) feels nauseous from motion sickness. We gave her a plastic bag and opened a window. We may need to stop if it gets worse.",
      ],
    },
    fixes: [
      "Medic attended. Student rested, recovered and rejoined the group.",
      "First-aid team monitored for 15 min. Student is fine.",
    ],
  },
  {
    type: "STUDENT_MISSING",
    severity: "high",
    weight: 9,
    notes: {
      padang: [
        "Headcount is one short on {bus} ({school}). Last seen going to the portable toilets. The teacher is searching, I am staying with the group.",
        "One boy from {school} cannot be found after the break. He is wearing the school PE shirt and an NDP cap. Please alert the marshals.",
      ],
      school: [
        "One student from {school} has not arrived at the school gate and is not answering his parent's calls. {bus} cannot leave until we confirm.",
      ],
    },
    fixes: [
      "Student found at the first-aid post and returned to the group. Headcount complete.",
      "Student was at the toilet block and has rejoined the group.",
    ],
  },
  {
    type: "BUS_DELAYED",
    severity: "medium",
    weight: 20,
    notes: {
      school: [
        "{bus} has not reached {school} yet. The report time has passed and the students are waiting at the pick-up point. Driver says traffic is heavy.",
      ],
      road: [
        "{bus} for {school} is stuck in heavy traffic on the expressway. We will be about 20 minutes late. Students are seated and fine.",
        "Road closures near the Padang forced our driver ({bus}, {school}) to re-route. We expect about 15 minutes delay. Students are okay.",
      ],
    },
    fixes: [
      "Bus has arrived and the group has boarded. Confirmed with the driver.",
      "Bus company confirmed traffic has cleared. Delay noted in the log.",
    ],
  },
  {
    type: "BUS_BREAKDOWN",
    severity: "high",
    weight: 5,
    notes: {
      road: [
        "{bus} ({school}) has broken down on the road shoulder, the engine is overheating. All students are safe. Requesting a replacement bus.",
        "The air-con on {bus} stopped working and the engine warning light is on. We pulled over. It is very hot inside. Need a replacement bus.",
      ],
    },
    fixes: [
      "Replacement bus arrived and the group transferred safely.",
      "The operator sent a replacement coach. Headcount confirmed.",
    ],
  },
  {
    type: "LOST_ITEM",
    severity: "low",
    weight: 22,
    notes: {
      padang: [
        "A student from {school} lost a blue water bottle in the seating area. Asking HQ if any lost-and-found item was handed in.",
        "A teacher's phone was misplaced near our seating block ({bus}, {school}). Requesting a lost-and-found check.",
      ],
      school: [
        "A student from {school} left her NDP funpack bag at the school gate while boarding {bus}. The teacher is bringing it over. Reporting for record.",
      ],
      road: [
        "A student on {bus} ({school}) cannot find her water bottle on the bus. We checked under the seats. Reporting for record.",
      ],
    },
    fixes: [
      "Item found at the lost-and-found counter and handed back.",
      "Item not found after checking with the marshals. Logged for follow-up with the school.",
    ],
  },
  {
    type: "OTHERS",
    severity: "medium",
    weight: 16,
    notes: {
      padang: [
        "The portable toilet queue near our block is very long. Students from {school} ({bus}) are getting restless. Can the marshals open another block?",
        "Light rain started and some students from {school} have no ponchos. Requesting spare ponchos for {bus}.",
      ],
      school: [
        "It started to rain as {bus} was boarding at {school}. Most students have no umbrella. Asking HQ for the weather plan.",
        "The teacher-in-charge has not arrived at {school} yet and I have the whole group assembled by myself. Please advise.",
      ],
      road: [
        "The driver of {bus} ({school}) is not sure where the drop-off point at the Padang is and asked us for directions. Please confirm the drop-off point.",
      ],
    },
    fixes: [
      "Marshals attended to the block and the issue is fixed.",
      "Ponchos and water were delivered to the block.",
    ],
  },
];

const PLACE_WEIGHT = { school: 3, road: 2, padang: 2 }; // how often each place is chosen (when the incident type allows it)

const pick = (list) => list[Math.floor(Math.random() * list.length)]; // one random item
const between = (a, b) => a + Math.random() * (b - a); // a random decimal between a and b
const nudge = (n) => n + between(-0.001, 0.001); // moves a coordinate by up to ~100 m, so pins are not stacked
const minutes = (date, m) => new Date(date.getTime() + m * 60000); // date + m minutes

// Pick a kind of incident, bigger weight = more often
function pickKind() {
  let roll = Math.random() * KINDS.reduce((sum, k) => sum + k.weight, 0);
  for (const k of KINDS) {
    roll -= k.weight;
    if (roll < 0) return k;
  }
  return KINDS[0];
}

// "1:30pm" -> minutes since midnight (810)
function clockMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]m)$/i.exec(String(text).trim());
  return m
    ? ((Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0)) * 60 + Number(m[2])
    : 14 * 60;
}

async function main() {
  await connect();
  const Incident = mongoose.model("Incident");
  const old = { slotId: { $regex: "^seed-" } }; // the demo incidents from an earlier run

  if (process.argv.includes("--remove")) {
    console.log(`Deleted ${(await Incident.deleteMany(old)).deletedCount} demo incidents.`);
    return;
  }

  // 1. The real data: show dates, schools, and who is assigned where
  const dates = {};
  for (const s of schedule) dates[s.name] = s.date;
  for (const s of await mongoose.model("Shows").find().lean()) dates[s.name] = s.date;
  const schools = {};
  for (const s of await mongoose.model("Schools").find().lean()) schools[String(s._id)] = s;
  const rows = await mongoose
    .model("Assignments")
    .find({ status: { $in: ["Accepted", "Pending"] }, school: { $ne: null } })
    .sort({ _id: 1 })
    .lean();

  // 2. Give every assigned volunteer a bus number within their school and show (Bus 1, Bus 2, ...)
  const busCount = {};
  const buses = [];
  for (const row of rows) {
    const school = schools[String(row.school)];
    if (!school || !dates[row.show]) continue;
    const key = `${row.school}|${row.show}`;
    busCount[key] = (busCount[key] || 0) + 1;
    buses.push({ row, school, date: dates[row.show], busNo: `Bus ${busCount[key]}` });
  }
  if (buses.length === 0) {
    console.log(
      "Nobody is assigned to a school yet, so there is nobody to report incidents. Run Allocations on the admin board first.",
    );
    return;
  }

  // 3. Make the incidents: each one comes from a different random bus
  const docs = [];
  const chosen = buses
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, COUNT);
  for (const bus of chosen) {
    const kind = pickKind();
    const text = (t) => t.replace("{school}", bus.school.name).replace("{bus}", bus.busNo);

    // Place: one of the places this kind of incident can happen at (school / road / padang). Schools are all over Singapore,
    // so a bigger weight for school and road (and a smaller one for the single Padang spot) spreads the pins over the island.
    const places = Object.keys(kind.notes);
    let placeRoll = Math.random() * places.reduce((sum, p) => sum + PLACE_WEIGHT[p], 0);
    const place = places.find((p) => (placeRoll -= PLACE_WEIGHT[p]) < 0) || places[0];

    // When: on the show day. The time fits the place: at the school before the bus leaves, on the road during the trip
    // to the Padang, at the Padang during the evening.
    const start = clockMinutes(bus.school.reportingTime);
    const [from, to] = {
      school: [start, start + 40],
      road: [start + 40, start + 110],
      padang: [17 * 60 + 30, 21 * 60 + 30],
    }[place];
    const m = Math.round(between(from, to));
    const created = new Date(
      `${bus.date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00+08:00`,
    );

    // Where: at the school (its real address and position), on the straight line school -> Padang, or at the Padang
    let lat, lng, address;
    if (place === "school") {
      lat = nudge(bus.school.lat);
      lng = nudge(bus.school.lng);
      address = `${bus.school.address}, Singapore ${bus.school.postalCode}`;
    } else if (place === "road") {
      const t = between(0.05, 0.6); // how far along the way from the school to the Padang (0.6 = a bit over half way, so pins stay near the school's part of the island)
      lat = nudge(bus.school.lat + t * (PADANG.lat - bus.school.lat));
      lng = nudge(bus.school.lng + t * (PADANG.lng - bus.school.lng));
      address = `On the bus, between ${bus.school.name} and the Padang`;
    } else {
      lat = nudge(PADANG.lat);
      lng = nudge(PADANG.lng);
      address = pick([
        "Padang, near City Hall",
        "Padang, Connaught Drive side",
        "Padang, St Andrew's Road side",
      ]);
    }

    // Status: most are resolved, some acknowledged, some still new (each step is a few minutes after the one before)
    const history = [{ status: "new", at: created }];
    const roll = Math.random();
    if (roll < 0.8) history.push({ status: "acknowledged", at: minutes(created, between(2, 10)) });
    if (roll < 0.6)
      history.push({
        status: "resolved",
        note: pick(kind.fixes),
        at: minutes(history[1].at, between(10, 45)),
      }); // resolving needs a note

    docs.push({
      type: kind.type,
      severity: kind.severity,
      note: text(pick(kind.notes[place])),
      slotId: `seed-${bus.row._id}`,
      school: bus.school.name,
      busNo: bus.busNo,
      volunteer: bus.row.volunteer,
      location: { lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
      address,
      status: history[history.length - 1].status,
      history,
      createdAt: created,
      updatedAt: history[history.length - 1].at,
    });
  }

  // 4. Save: delete the old demo incidents first, so running twice never piles up.
  // .collection saves the dates exactly as given (Mongoose's own insert would replace them with "now").
  await Incident.deleteMany(old);
  await Incident.collection.insertMany(docs);
  console.log(
    `Inserted ${docs.length} incidents. The database now has ${await Incident.countDocuments(old)} demo incidents.`,
  );
}

main()
  .catch((err) => console.error(err.message || err))
  .finally(disconnect);
