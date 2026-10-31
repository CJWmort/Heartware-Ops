// Script that creates demo incidents for testing the queue.
// HOW TO RUN (from the server folder):
//   pnpm run seed:incidents               -> adds 60 demo incidents (replaces old demo ones)
//   pnpm run seed:incidents -- --remove   -> deletes the demo incidents
// Before this: volunteers must already be assigned to schools (Run Allocations on the admin board).

const mongoose = require("mongoose");
const { connect, disconnect } = require("./_connect");
const schedule = require("../data/schedule.json");
require("../models/account-model");
require("../models/assignments-model");
require("../models/schools-model");
require("../models/shows-model");
require("../models/incidents-model");

const COUNT = 60;
const PADANG = { lat: 1.2905591, lng: 103.8529176 };

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

const PLACE_WEIGHT = { school: 3, road: 2, padang: 2 };

// pick(list) - a random item from a list.
const pick = (list) => list[Math.floor(Math.random() * list.length)];
// between(a, b) - a random number between a and b.
const between = (a, b) => a + Math.random() * (b - a);
// nudge(n) - moves a coordinate a tiny random amount so pins do not stack.
const nudge = (n) => n + between(-0.001, 0.001);
// minutes(date, m) - a new date m minutes after the given date.
const minutes = (date, m) => new Date(date.getTime() + m * 60000);

// pickKind() - weighted random choice of an incident kind: roll a number up to the total weight and
// subtract each kind's weight until it goes below 0.
function pickKind() {
  let roll = Math.random() * KINDS.reduce((sum, k) => sum + k.weight, 0);
  for (const k of KINDS) {
    roll -= k.weight;
    if (roll < 0) return k;
  }
  return KINDS[0];
}

// clockMinutes(text) - "1:30pm" -> minutes since midnight (810); anything unreadable falls back to
// 2:00 pm.
function clockMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})\s*([ap]m)$/i.exec(String(text).trim());
  return m
    ? ((Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0)) * 60 + Number(m[2])
    : 14 * 60;
}

// main() - 1) connect 2) --remove deletes the incidents whose slotId starts with "seed-" 3) load show
// dates, schools and assigned volunteers 4) give every assignment a bus number inside its school and
// show 5) pick up to 60 random buses and for each choose an incident kind, a place (school / road /
// padang), a realistic time and position, and a status history 6) delete old demo incidents then
// insert the new ones directly into the collection (keeps the custom dates).
async function main() {
  await connect();
  const Incident = mongoose.model("Incident");
  const old = { slotId: { $regex: "^seed-" } };

  if (process.argv.includes("--remove")) {
    console.log(`Deleted ${(await Incident.deleteMany(old)).deletedCount} demo incidents.`);
    return;
  }

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

  const docs = [];
  const chosen = buses
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, COUNT);
  for (const bus of chosen) {
    const kind = pickKind();
    // text(t) - fills the {school} and {bus} placeholders in a message with this bus's school name and
    // bus number.
    const text = (t) => t.replace("{school}", bus.school.name).replace("{bus}", bus.busNo);

    const places = Object.keys(kind.notes);
    let placeRoll = Math.random() * places.reduce((sum, p) => sum + PLACE_WEIGHT[p], 0);
    const place = places.find((p) => (placeRoll -= PLACE_WEIGHT[p]) < 0) || places[0];

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

    let lat, lng, address;
    if (place === "school") {
      lat = nudge(bus.school.lat);
      lng = nudge(bus.school.lng);
      address = `${bus.school.address}, Singapore ${bus.school.postalCode}`;
    } else if (place === "road") {
      const t = between(0.05, 0.6);
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

    const history = [{ status: "new", at: created }];
    const roll = Math.random();
    if (roll < 0.8) history.push({ status: "acknowledged", at: minutes(created, between(2, 10)) });
    if (roll < 0.6)
      history.push({
        status: "resolved",
        note: pick(kind.fixes),
        at: minutes(history[1].at, between(10, 45)),
      });

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

  await Incident.deleteMany(old);
  await Incident.collection.insertMany(docs);
  console.log(
    `Inserted ${docs.length} incidents. The database now has ${await Incident.countDocuments(old)} demo incidents.`,
  );
}

main()
  .catch((err) => console.error(err.message || err))
  .finally(disconnect);
