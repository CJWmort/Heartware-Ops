// seeding-incidents.js - fills the "incidents" collection with REALISTIC demo incidents.
//
// WHAT IT DOES
//   Reads the data that is already in your database (volunteers assigned to schools, the show dates),
//   then invents incident reports that could really have happened on each NE Show day:
//     - the reporter is a volunteer who is assigned to a school for that show (Accepted or Pending); the school and
//       bus number come from that volunteer's assignment
//     - the incident happens on the show's real date (from the "shows" collection), at a time that fits the
//       school's reporting time and the bus journey (school -> Padang -> school)
//     - the GPS point and address match where the bus would be at that time
//     - severity is the same one the report page sends (defaultSeverity in data/incident-templates.json)
//     - status and history follow the HQ workflow: new -> acknowledged -> resolved (resolve always has a note)
//
// HOW TO RUN (from the server/ folder)
//   node scripts/seeding-incidents.js --dry-run              (preview only, nothing is written)
//   node scripts/seeding-incidents.js                        (replace old seeded incidents with a fresh set)
//   node scripts/seeding-incidents.js --remove               (delete the seeded incidents again)
//
//   Options:
//     --now="2027-07-03 22:00"   the pretend "current time" in Singapore time (default: 2027-07-03 22:00).
//                                Tip: if your terminal splits the space, write it as --now=2027-07-03T22:00
//                                Shows before it are finished, a show on that day is "in progress" (some incidents
//                                still new / acknowledged), shows after it get no incidents yet.
//     --now=all                  pretend every show is already finished
//     --rate=0.08                share of accepted buses that report something (default 8%)
//     --show="NE Show 2"         only seed one show
//     --seed=2027                same number = same incidents every run (change it for a different set)
//     --accepted-only            only volunteers who pressed Accept (default: Accepted AND Pending, i.e. everyone assigned)
//     --demo-only                only the demo volunteers (demo.volunteerNNN@demo.sg); default is every assigned volunteer
//     --yes                      do not ask "are you sure?"
//
// SAFETY
//   - Only incidents whose slotId starts with "seed-" are ever deleted, so incidents filed through the real app stay.
//   - Seeded incidents are attached to assigned volunteers; add --demo-only to keep real accounts out of it.
//   - The database address comes from config.env (through _connect.js) and is never printed.

const path = require('path')
const schedule = require('../data/schedule.json') // show name -> date, used if the shows collection is empty
const templates = require('../data/incident-templates.json') // type -> defaultSeverity (what the report page sends)

// ---------------------------------------------------------------------------------------------
// Settings (every "assumption" about the real event is here, so you can change it in one place)
// ---------------------------------------------------------------------------------------------
const SEED_PREFIX = 'seed-' // every seeded incident gets slotId = "seed-<assignment id>"; this is how --remove finds them
const DEMO_EMAIL_PATTERN = /^demo\.volunteer\d+@demo\.sg$/ // same pattern as seed-volunteers.js

const DEFAULT_NOW = '2027-07-03 22:00' // just after NE Show 2 ends (busiest moment for HQ): show 1 finished, show 2 has a few open incidents, shows 3 and 4 not yet
const DEFAULT_RATE = 0.08 // 8% of accepted buses report at least one incident (about 16 per show)
const DEFAULT_SEED = 2027

const PADANG = [1.2905591, 103.8529176] // [lat, lng] - the same Padang point the client uses in utils/constants.js
const MIN = 60 * 1000 // one minute in milliseconds (JavaScript dates count in milliseconds)

// Journey timeline (ASSUMPTIONS - the real timetable is not in the repo, so change these if HQ gives you the real one)
const BRIEFING_MINUTES = 30 // reporting time -> bus leaves the school (headcount, safety briefing, boarding)
const MINUTES_BASE = 15 // fixed part of the bus journey (loading, leaving the school area, parking at the venue)
const MINUTES_PER_KM = 2.5 // extra minutes per km in the evening traffic (about 24 km/h)
const SHOW_START = [19, 0] // [hour, minute] the show begins
const SHOW_END = [21, 15] // [hour, minute] the show ends
const MARSHALLING_MINUTES = [30, 60] // show ends -> bus leaves the Padang (crowd leaving, finding the bus)

// Which type of incident happens how often (weights, they do not have to add up to 100)
const TYPE_WEIGHTS = {
  STUDENT_UNWELL: 28,
  LOST_ITEM: 22,
  BUS_DELAYED: 20,
  OTHERS: 16,
  STUDENT_MISSING: 9,
  BUS_BREAKDOWN: 5,
}

// The six stages of a volunteer's day. An incident happens in ONE stage, and the stage decides the time and the place.
const PRE = 'pre_departure' // at the school, before the bus leaves
const OUT = 'outbound' // on the bus, school -> Padang
const WAIT = 'venue_wait' // at the Padang, before the show starts
const SHOW = 'show' // at the Padang, during the show
const BOARD = 'return_boarding' // at the Padang, after the show, finding the bus
const BACK = 'return' // on the bus, Padang -> school

// For each incident type: how likely each stage is (e.g. a breakdown can only happen while the bus is moving or boarding)
const PHASE_WEIGHTS = {
  STUDENT_UNWELL: { [PRE]: 5, [OUT]: 15, [WAIT]: 30, [SHOW]: 25, [BOARD]: 10, [BACK]: 15 },
  STUDENT_MISSING: { [PRE]: 5, [WAIT]: 30, [SHOW]: 20, [BOARD]: 45 },
  BUS_DELAYED: { [PRE]: 25, [OUT]: 30, [BOARD]: 25, [BACK]: 20 },
  BUS_BREAKDOWN: { [OUT]: 40, [BOARD]: 20, [BACK]: 40 },
  LOST_ITEM: { [WAIT]: 20, [SHOW]: 25, [BOARD]: 35, [BACK]: 20 },
  OTHERS: { [PRE]: 10, [OUT]: 10, [WAIT]: 30, [SHOW]: 20, [BOARD]: 20, [BACK]: 10 },
}

// How long HQ takes to react (minutes, a random number between the two). Urgent things are picked up faster.
const ACK_MINUTES = { high: [1, 5], medium: [2, 10], low: [5, 30] }
// How long it takes to fix, counted from "acknowledged" (minutes). A replacement bus takes longest.
const RESOLVE_MINUTES = {
  STUDENT_UNWELL: [10, 45],
  STUDENT_MISSING: [5, 25],
  BUS_DELAYED: [10, 40],
  BUS_BREAKDOWN: [25, 75],
  LOST_ITEM: [15, 120],
  OTHERS: [5, 40],
}
const LOST_ITEM_STAYS_OPEN = 0.25 // 25% of lost items stay "acknowledged" (nobody has handed the item in yet)

// Where at the Padang the volunteer might be standing (descriptions, because a volunteer types an address like this)
const SPOTS_SEATING = [
  'Padang seating area, near City Hall',
  "Padang, Connaught Drive side",
  "Padang, St Andrew's Road side",
  'Padang, school seating block',
]
const SPOTS_PICKUP = [
  'Bus pick-up area near the Padang',
  'Padang exit gate, near the bus pick-up area',
  'Roadside waiting area near the Padang',
]

// ---------------------------------------------------------------------------------------------
// What the volunteer types. Each entry is [stages it fits, text]. null = fits any stage.
// {school} {bus} {time} {road} {mins} are filled in automatically. No names of students (privacy).
// ---------------------------------------------------------------------------------------------
const NOTES = {
  STUDENT_UNWELL: [
    [[WAIT, SHOW], 'A P5 boy from {school} ({bus}) feels dizzy and has a headache from the heat, since about {time}. We moved him to the shade and he is sipping water. He is conscious and talking. Requesting a medic to check on him.'],
    [[WAIT, SHOW], 'A P5 girl is feeling faint after waiting in the sun at the Padang. She has not eaten much since lunch. Seated her down and giving water. Please send first aid support. Reported at {time}.'],
    [[SHOW], 'A student from {school} vomited in the seats at {time} and says his stomach hurts. The group is calm and I am staying with him. Please send someone with a medic kit.'],
    [[OUT, BACK], 'A student on {bus} feels nauseous (motion sickness) at {time}. The bus is moving along the {road}. We gave her a plastic bag and opened a window. We may need to stop if it gets worse.'],
    [[PRE], 'One P5 boy at {school} has a fever and a sore throat before boarding at {time}. The teacher-in-charge knows. Not sure if he should join the trip. Please advise.'],
    [[SHOW, BOARD], 'A student twisted her ankle on the steps at {time}. She can walk slowly with support and the swelling is small. Please advise if the medic should check her.'],
    [null, 'A student is complaining of stomach pain at about {time}. A teacher is with her and she is resting. I will update HQ if it gets worse.'],
  ],
  STUDENT_MISSING: [
    [[WAIT, SHOW], 'Headcount at {time} is one short on {bus} ({school}). Last seen going to the portable toilets with a friend about 10 minutes ago. The teacher is checking the toilet queue and I am staying with the rest of the group.'],
    [[BOARD], 'We counted again before boarding and one P5 girl from {school} is missing. She was with the group at the exit gate a few minutes ago. Please alert the marshals near the pick-up area. Time {time}.'],
    [[WAIT, SHOW], 'A boy from my group cannot be found since {time}. He is wearing the school PE shirt and an NDP cap. The teachers are searching row by row and the rest of the group is seated.'],
    [[PRE], "One student from {school} has not arrived at the school gate and is not answering his parent's calls. {bus} cannot leave until we confirm. Time {time}."],
  ],
  BUS_DELAYED: [
    [[PRE], '{bus} has not reached {school} yet. The report time has passed and the students are waiting at the pick-up point. The driver says traffic is heavy. ETA about {mins} min.'],
    [[OUT], '{bus} is stuck in heavy traffic on the {road}. We will be about {mins} minutes behind schedule to the Padang. Students are seated and fine. Time {time}.'],
    [[OUT], 'Road closures near the Padang forced our driver to re-route. We expect about {mins} min delay. Students are okay. Time {time}.'],
    [[BOARD], 'Our bus ({school}, {bus}) is not at the pick-up area yet. Students are waiting at the roadside with the teachers. The driver says he is stuck in the queue of buses, ETA {mins} min. Time {time}.'],
    [[BACK], 'Heavy traffic on the {road} after the show. We will reach {school} about {mins} min later than planned. The school has been told so parents can be informed.'],
  ],
  BUS_BREAKDOWN: [
    [[OUT], '{bus} has broken down along the {road} at {time}. The engine is overheating and the driver stopped on the road shoulder. All students are safe and seated with seatbelts on. Requesting a replacement bus.'],
    [[OUT, BACK], 'The air-con on {bus} stopped working and the driver says the engine warning light is on. We pulled over at {time}. It is very hot inside so students are drinking water. We need a replacement bus or a technician.'],
    [[BOARD], '{bus} will not start after the show (battery problem, says the driver). The students are waiting with the teachers at the pick-up area. Time {time}. We need another bus.'],
    [[OUT, BACK], 'Flat tyre on {bus} on the {road} at {time}. The driver has stopped at a safe spot. No injuries and the students are calm. Waiting for the bus company to send help.'],
  ],
  LOST_ITEM: [
    [[WAIT, SHOW, BOARD], 'A student lost her water bottle (blue, with the school name) somewhere in the seating area. Reported at {time}. Asking HQ if any lost-and-found item has been handed in.'],
    [[BOARD, BACK], "At {time} we realised a student's NDP funpack bag was left under the seats at the Padang. Can HQ check our seating block?"],
    [[BACK], 'A school bag was left on {bus} after we got back to {school}. The driver has left already. HQ please contact the bus company.'],
    [[WAIT, SHOW, BOARD], 'Two students cannot find their EZ-Link cards and one cap. We searched around the group area. Reporting for record only, not urgent.'],
    [[SHOW, BOARD], "A teacher's phone was misplaced near our seating block at about {time}. It was last seen when the water was handed out. Requesting a lost-and-found check."],
  ],
  OTHERS: [
    [[PRE, OUT], 'It started to rain as we were boarding at {time}. Most students have no umbrella. Asking HQ for the weather plan.'],
    [[WAIT, SHOW], 'Light rain began at {time} and some students have no ponchos. Requesting spare ponchos for {bus}.'],
    [[WAIT, SHOW], 'The portable toilet queue near our block is very long (about 30 min). Students from {school} are getting restless. Can the marshals open another block?'],
    [[WAIT, SHOW], 'Our seats were taken by another school group and no block marshal is around. Time {time}. We need help to confirm the correct seating zone for {school}.'],
    [[WAIT, BOARD], 'The water supply ran out in our block. About 40 students have had no water for the past {mins} minutes. Please arrange a refill.'],
    [[BOARD], 'The crowd at the exit gate is very dense and we cannot move our group to the pick-up area. I am worried students may get separated. Time {time}.'],
    [[OUT], 'The driver of {bus} is not sure where the drop-off point at the Padang is and asked us for directions. Time {time}. Please confirm the drop-off point.'],
    [[PRE], 'The teacher-in-charge has not arrived at {school} yet and I have the whole group assembled by myself. Time {time}. Please advise.'],
    [[BACK], 'We reached {school} at {time}. Many parents are waiting along the road and blocking the bus bay. Need guidance for a safe dismissal.'],
  ],
}

// What HQ types when it resolves (the app refuses to resolve without a note).
const RESOLUTIONS = {
  STUDENT_UNWELL: [
    'Medic attended. Student rested, recovered and rejoined the group.',
    'First-aid team gave water and monitored for 15 min. Student is fine and back in the seat.',
    'School contacted the parent. Student fit to continue, no further action.',
    'Brought to the first-aid post and advised to rest. Teacher stayed with the student for the rest of the show.',
  ],
  STUDENT_MISSING: [
    'Student found at the first-aid post and returned to the group. Headcount complete.',
    'Student was at the toilet block and has rejoined the group. Headcount complete.',
    'A marshal found the student near the next block and reunited them with the volunteer.',
  ],
  BUS_DELAYED: [
    'Bus has arrived at the pick-up point and the group has boarded. Confirmed with the driver.',
    'Bus company confirmed traffic has cleared and the bus is on its way. Volunteer informed.',
    'Group reached the destination. Delay noted in the log, no further action.',
  ],
  BUS_BREAKDOWN: [
    'Replacement bus arrived and the group transferred safely. The operator towed the original bus.',
    'The operator sent a replacement coach. Group continued the journey and headcount was confirmed.',
  ],
  LOST_ITEM: [
    'Item found at the lost-and-found counter and handed back to the volunteer.',
    'The operator found the item on the bus. It will be returned to the school the next day.',
    'Item not found after checking with the marshals. Logged for follow-up with the school.',
  ],
  OTHERS: [
    'Marshals attended to the block and the issue is fixed. Volunteer confirmed.',
    'Ponchos and water were delivered to the block.',
    'HQ advised an alternative seating zone and confirmed with the volunteer.',
  ],
}

// Make sure every (type, stage) that can be picked has at least one note. Runs at start-up, so a typo in the lists
// above fails loudly instead of crashing half way through.
function checkTemplates() {
  for (const type of Object.keys(TYPE_WEIGHTS)) {
    for (const [phase, weight] of Object.entries(PHASE_WEIGHTS[type])) {
      const fits = NOTES[type].some(([phases]) => phases === null || phases.includes(phase))
      if (weight > 0 && !fits) throw new Error(`no note written for ${type} in stage ${phase}`)
    }
    if (!RESOLUTIONS[type] || !RESOLVE_MINUTES[type]) throw new Error(`missing resolutions for ${type}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Small helpers (pure functions: no database, easy to test)
// ---------------------------------------------------------------------------------------------

// Seeded random numbers (mulberry32, same as seed-volunteers.js). WHY: the same seed gives the same incidents every
// time, which makes the script repeatable. Returns an object with the few random tools this script needs.
function makeRandom(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 // a number from 0 up to (not including) 1
  }
  return {
    next,
    uniform: (low, high) => low + next() * (high - low), // a decimal between low and high
    int: (low, high) => low + Math.floor(next() * (high - low + 1)), // a whole number between low and high (both included)
    choice: (list) => list[Math.floor(next() * list.length)], // one item of the list
    // pick a key of {key: weight}; a bigger weight is picked more often
    weighted: (weights) => {
      const entries = Object.entries(weights)
      let roll = next() * entries.reduce((sum, [, w]) => sum + w, 0)
      for (const [key, w] of entries) {
        roll -= w
        if (roll < 0) return key
      }
      return entries[entries.length - 1][0] // safety net for rounding
    },
    // `count` different items, chosen at random (Fisher-Yates shuffle of a copy, then cut)
    sample: (list, count) => {
      const copy = list.slice()
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy.slice(0, count)
    },
  }
}

const pad = (n) => String(n).padStart(2, '0')

// '1:30pm' -> [13, 30]. Reporting times in the schools collection look like this.
function parseClock(text) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*([ap]m)\s*$/i.exec(String(text))
  if (!m) throw new Error(`cannot read reporting time '${text}' (expected e.g. 1:30pm)`)
  const hour = (Number(m[1]) % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0) // 12am -> 0, 12pm -> 12, 1pm -> 13
  return [hour, Number(m[2])]
}

// A Singapore-time Date on `day` ('YYYY-MM-DD') at hour:minute. The "+08:00" is Singapore's offset (no daylight saving).
const atTime = (day, hour, minute) => new Date(`${day}T${pad(hour)}:${pad(minute)}:00+08:00`)

// Date -> '4:45pm' in Singapore time (used inside the volunteer's note)
function clockText(date) {
  const t = new Date(date.getTime() + 8 * 60 * MIN) // shift +8h, then read the UTC parts = Singapore clock
  const hour = t.getUTCHours()
  return `${hour % 12 || 12}:${pad(t.getUTCMinutes())}${hour < 12 ? 'am' : 'pm'}`
}

// Straight-line distance in km between two points on the earth (haversine)
function haversineKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Move a point a random distance (up to `metres`) in a random direction, so pins are not stacked on one spot
function jitter(random, [lat, lng], metres) {
  const distance = metres * Math.sqrt(random.next()) // sqrt = spread evenly over the circle (not bunched in the middle)
  const angle = random.next() * 2 * Math.PI
  return [
    lat + (distance * Math.cos(angle)) / 111320, // 1 degree of latitude is about 111,320 m
    lng + (distance * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180)), // degrees of longitude get shorter away from the equator
  ]
}

// The point `fraction` (0..1) of the way from start to end (straight line)
const along = (start, end, fraction) => [start[0] + fraction * (end[0] - start[0]), start[1] + fraction * (end[1] - start[1])]

// A believable expressway name for that part of Singapore (rough guess from the position, only for flavour text)
function roadNear(random, [lat, lng]) {
  if (lng < 103.76) return random.choice(['PIE', 'AYE', 'BKE']) // west
  if (lng > 103.9) return random.choice(['PIE', 'ECP', 'TPE']) // east
  if (lat > 1.385) return random.choice(['CTE', 'SLE', 'BKE']) // north
  return random.choice(['CTE', 'PIE', 'AYE']) // centre / south
}

// When does each stage start for ONE bus on show day? Returns an object of Dates.
function buildTimeline(random, day, reportingTime, schoolPoint) {
  const report = atTime(day, ...parseClock(reportingTime)) // volunteers meet the class at the school
  const depart = new Date(report.getTime() + (BRIEFING_MINUTES + random.int(0, 10)) * MIN)
  const km = haversineKm(schoolPoint[0], schoolPoint[1], PADANG[0], PADANG[1])
  const trip = (MINUTES_BASE + km * MINUTES_PER_KM) * random.uniform(0.9, 1.3) * MIN // traffic makes it vary
  const arrive = new Date(depart.getTime() + trip)
  const showStart = new Date(Math.max(atTime(day, ...SHOW_START).getTime(), arrive.getTime() + 30 * MIN)) // never start before the bus has arrived
  const showEnd = new Date(Math.max(atTime(day, ...SHOW_END).getTime(), showStart.getTime() + 60 * MIN))
  const leavePadang = new Date(showEnd.getTime() + random.int(...MARSHALLING_MINUTES) * MIN)
  const back = new Date(leavePadang.getTime() + trip * random.uniform(0.9, 1.4)) // the way back is often slower (everyone leaves together)
  return { report, depart, arrive, showStart, showEnd, leavePadang, back }
}

// [start, end] of a stage
function phaseWindow(phase, tl) {
  return {
    [PRE]: [tl.report, tl.depart],
    [OUT]: [tl.depart, tl.arrive],
    [WAIT]: [tl.arrive, tl.showStart],
    [SHOW]: [tl.showStart, tl.showEnd],
    [BOARD]: [tl.showEnd, tl.leavePadang],
    [BACK]: [tl.leavePadang, tl.back],
  }[phase]
}

// Where is the bus / group at that moment? Returns { lat, lng, address, road }.
// `road` is chosen ONCE here, so the address and the volunteer's note always name the same expressway.
function placeFor(random, phase, moment, tl, school) {
  const schoolPoint = [school.lat, school.lng]
  const [start, end] = phaseWindow(phase, tl)
  const progress = (moment - start) / Math.max(end - start, 1000) // 0 = start of the stage, 1 = end

  if (phase === PRE) { // standing outside the school
    const [lat, lng] = jitter(random, schoolPoint, 60)
    return { lat, lng, address: `${school.address}, Singapore ${school.postalCode}`, road: roadNear(random, [lat, lng]) }
  }
  if (phase === OUT) { // somewhere on the straight line school -> Padang
    const [lat, lng] = jitter(random, along(schoolPoint, PADANG, progress), 150)
    const road = roadNear(random, [lat, lng])
    return { lat, lng, address: `On the bus along the ${road}, heading to the Padang (from ${school.name})`, road }
  }
  if (phase === WAIT || phase === SHOW) { // in the seating area
    const [lat, lng] = jitter(random, PADANG, 120)
    return { lat, lng, address: random.choice(SPOTS_SEATING), road: roadNear(random, [lat, lng]) }
  }
  if (phase === BOARD) { // leaving the seats, looking for the bus
    const [lat, lng] = jitter(random, PADANG, 100)
    return { lat, lng, address: random.choice(SPOTS_PICKUP), road: roadNear(random, [lat, lng]) }
  }
  // BACK: somewhere on the straight line Padang -> school
  const [lat, lng] = jitter(random, along(PADANG, schoolPoint, progress), 150)
  const road = roadNear(random, [lat, lng])
  return { lat, lng, address: `On the bus along the ${road}, heading back to ${school.name}`, road }
}

// Choose a text from a list of [stages, text] that fits the stage
function pickText(random, pool, phase) {
  return random.choice(pool.filter(([phases]) => phases === null || phases.includes(phase)))[1]
}

// Fill {school}, {bus}... in a note
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, key) => String(values[key]))

// MongoDB keeps milliseconds only; we also drop them so times look like real minutes
const wholeSeconds = (date) => new Date(Math.floor(date.getTime() / 1000) * 1000)

// ---------------------------------------------------------------------------------------------
// Build the incidents (pure function: give it people and shows, get documents back; nothing is saved here)
//   candidates = [{ assignmentId, volunteerId, show, date, busNo, school: {...} }, ...]
//   now        = a Date: anything after it has not happened yet
//   makeId     = how to make an ObjectId (the database part passes mongoose's one; tests pass a fake)
// ---------------------------------------------------------------------------------------------
function buildIncidents(candidates, now, makeId, rate = DEFAULT_RATE, seed = DEFAULT_SEED) {
  checkTemplates()
  const severityOf = Object.fromEntries(templates.map((t) => [t.type, t.defaultSeverity || 'medium'])) // same severity the report page sends
  for (const type of Object.keys(TYPE_WEIGHTS)) {
    if (!severityOf[type]) throw new Error(`${type} is not in data/incident-templates.json`) // model enum and file disagree
  }

  const random = makeRandom(seed)
  const docs = []
  const summary = {}

  for (const show of [...new Set(candidates.map((c) => c.show))].sort()) {
    const pool = candidates.filter((c) => c.show === show)
    const wanted = Math.min(pool.length, Math.max(1, Math.round(pool.length * rate))) // how many buses report something
    const stats = (summary[show] = { buses: pool.length, later: 0, docs: [] }) // later = would happen after "now", so skipped

    for (const cand of random.sample(pool, wanted)) { // each chosen bus reports once (random sample = no repeats)
      const type = random.weighted(TYPE_WEIGHTS)
      const phase = random.weighted(PHASE_WEIGHTS[type])
      const school = cand.school
      const tl = buildTimeline(random, cand.date, school.reportingTime, [school.lat, school.lng])
      const [start, end] = phaseWindow(phase, tl)
      const created = wholeSeconds(new Date(start.getTime() + (end - start) * random.next())) // a random moment inside the stage

      if (created > now) { // it has not happened yet in our pretend timeline
        stats.later++
        continue
      }

      const { lat, lng, address, road } = placeFor(random, phase, created, tl, school)
      const severity = severityOf[type]
      const note = fill(pickText(random, NOTES[type], phase), {
        school: school.name, bus: cand.busNo, time: clockText(created), road, mins: random.choice([10, 15, 20, 25, 30, 40]),
      })
      if (note.length === 0 || note.length > 500) throw new Error(`note too long/short for ${type}`) // the model allows 500 characters

      // --- the HQ workflow: new -> acknowledged -> resolved, each step later than the one before ---
      const history = [{ status: 'new', at: created }]
      const ackAt = wholeSeconds(new Date(created.getTime() + random.uniform(...ACK_MINUTES[severity]) * MIN))
      const resAt = wholeSeconds(new Date(ackAt.getTime() + random.uniform(...RESOLVE_MINUTES[type]) * MIN))
      const staysOpen = type === 'LOST_ITEM' && random.next() < LOST_ITEM_STAYS_OPEN
      const resolution = random.choice(RESOLUTIONS[type])
      if (ackAt <= now) { // only steps that already happened by "now" are recorded
        history.push({ status: 'acknowledged', at: ackAt }) // the real app sends no note when acknowledging
        if (resAt <= now && !staysOpen) history.push({ status: 'resolved', note: resolution, at: resAt }) // resolving always needs a note
      }

      const doc = {
        type,
        severity,
        note,
        slotId: `${SEED_PREFIX}${cand.assignmentId}`,
        school: school.name,
        busNo: cand.busNo,
        volunteer: cand.volunteerId,
        location: { lat: +lat.toFixed(6), lng: +lng.toFixed(6) },
        address,
        status: history[history.length - 1].status, // the current status is simply the last step
        history: history.map((h) => ({ _id: makeId(), ...h })), // Mongoose gives every history entry its own _id, so we do too
        createdAt: created,
        updatedAt: history[history.length - 1].at, // Mongoose bumps updatedAt on every save, so it equals the last step
      }
      docs.push(doc)
      stats.docs.push(doc) // remembered per show, only for the report table
    }
  }

  docs.sort((a, b) => a.createdAt - b.createdAt) // oldest first, like they would have arrived
  return { docs, summary }
}

// ---------------------------------------------------------------------------------------------
// Database part
// ---------------------------------------------------------------------------------------------
function readOptions(argv) {
  const text = (name) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`))
    return arg ? arg.slice(name.length + 3).replace(/^"|"$/g, '').trim() : ''
  }
  const rate = text('rate') ? Number(text('rate')) : DEFAULT_RATE
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw new Error('--rate must be above 0 and at most 1 (e.g. 0.08 = 8%)')

  const nowText = text('now') || DEFAULT_NOW
  let now
  if (nowText.toLowerCase() === 'all') now = new Date('2100-01-01T00:00:00+08:00') // far in the future = every show is finished
  else {
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(nowText)) throw new Error('--now must look like "2027-07-03 22:00" or 2027-07-03T22:00 (or the word all)')
    now = new Date(nowText.replace(' ', 'T') + ':00+08:00')
  }
  const seed = text('seed') ? Number(text('seed')) : DEFAULT_SEED
  if (!Number.isInteger(seed)) throw new Error('--seed must be a whole number')

  return {
    now, rate, seed,
    show: text('show'),
    acceptedOnly: argv.includes('--accepted-only'),
    demoOnly: argv.includes('--demo-only'),
    dryRun: argv.includes('--dry-run'),
    remove: argv.includes('--remove'),
    yes: argv.includes('--yes'),
    force: argv.includes('--force'),
  }
}

// Ask "are you sure?". --yes skips the question.
async function confirm(message, assumeYes) {
  console.log(message)
  if (assumeYes) return true
  if (!process.stdin.isTTY) throw new Error('Not an interactive terminal: add --yes to continue.')
  const readline = require('node:readline/promises')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question("Type 'yes' to continue: ")
  rl.close()
  return answer.trim().toLowerCase() === 'yes'
}

// Accepted assignments joined with their school and show date. Returns { candidates, warnings }.
async function fetchCandidates(mongoose, options) {
  const warnings = []
  const Account = mongoose.model('Account')
  const Assignments = mongoose.model('Assignments')
  const Schools = mongoose.model('Schools')
  const Shows = mongoose.model('Shows')

  // show name -> date. The shows collection wins; data/schedule.json fills in if a show was never seeded.
  const dates = {}
  for (const s of schedule) dates[s.name] = s.date
  for (const s of await Shows.find().lean()) dates[s.name] = s.date

  const schools = {} // school _id -> school document
  for (const s of await Schools.find().lean()) schools[String(s._id)] = s

  // Which assignments count: ones that have a school (Reserve rows have none) and are Accepted or Pending.
  // Declined / Withdrawn rows are deleted by the app, so they never show up here.
  const statuses = options.acceptedOnly ? ['Accepted'] : ['Accepted', 'Pending']
  const query = { status: { $in: statuses }, school: { $ne: null } }
  if (options.demoOnly) { // only the demo accounts, like simulate-responses.js
    const demo = await Account.find({ email: { $regex: DEMO_EMAIL_PATTERN } }).select('_id').lean()
    if (demo.length === 0) warnings.push("No demo volunteers found (--demo-only). Run 'pnpm run seed:volunteers' first, or leave --demo-only off.")
    query.volunteer = { $in: demo.map((d) => d._id) }
  }
  if (options.show) query.show = options.show

  const busCounter = {}
  const candidates = []
  for (const row of await Assignments.find(query).sort({ _id: 1 }).lean()) { // sorted by id so bus numbers are stable between runs
    const school = schools[String(row.school)]
    const date = dates[row.show]
    if (!school || !date) {
      warnings.push(`skipped assignment ${row._id}: school or show date not found`)
      continue
    }
    const key = `${row.school}|${row.show}`
    busCounter[key] = (busCounter[key] || 0) + 1 // 1st accepted volunteer of a school+show = Bus 1, and so on
    candidates.push({ assignmentId: row._id, volunteerId: row.volunteer, show: row.show, date, busNo: `Bus ${busCounter[key]}`, school })
  }
  return { candidates, warnings }
}

// When nothing was found, say WHY with real numbers from the database (so you do not have to guess)
async function explainEmpty(mongoose, options) {
  const Assignments = mongoose.model('Assignments')
  const byStatus = await Assignments.aggregate([{ $group: { _id: { status: '$status', hasSchool: { $ne: ['$school', null] } }, n: { $sum: 1 } } }])
  console.log(`Assignments in the database: ${byStatus.reduce((sum, r) => sum + r.n, 0)}`)
  for (const r of byStatus) console.log(`  ${r._id.status}${r._id.hasSchool ? '' : ' (no school yet)'}: ${r.n}`)
  console.log(`Volunteer accounts: ${await mongoose.model('Account').countDocuments({ role: 'volunteer' })}, schools: ${await mongoose.model('Schools').countDocuments()}`)
  console.log(`Looking for: status ${options.acceptedOnly ? 'Accepted' : 'Accepted or Pending'}${options.demoOnly ? ', demo volunteers only' : ''}${options.show ? `, show "${options.show}"` : ''}.`)
  console.log('If the numbers above are 0: run Allocations on the admin board first (that creates the assignments).')
}

// A small table: per show, how many incidents and in which status
function printReport(docs, summary) {
  console.log(`\n${'Show'.padEnd(12)}${'Buses'.padStart(6)}${'Incidents'.padStart(10)}${'New'.padStart(6)}${'Ack'.padStart(6)}${'Resolved'.padStart(9)}${'Later'.padStart(7)}`)
  for (const [show, s] of Object.entries(summary).sort()) {
    const count = (status) => s.docs.filter((d) => d.status === status).length
    console.log(`${show.padEnd(12)}${String(s.buses).padStart(6)}${String(s.docs.length).padStart(10)}${String(count('new')).padStart(6)}${String(count('acknowledged')).padStart(6)}${String(count('resolved')).padStart(9)}${String(s.later).padStart(7)}`)
  }
  const byType = {}
  for (const d of docs) byType[d.type] = (byType[d.type] || 0) + 1
  console.log('\nBy type: ' + Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(', '))
  console.log("('Later' = would happen after the pretend current time, so it was not created.)")
}

async function main() {
  const options = readOptions(process.argv.slice(2))

  // Safety: demo data must never land in a real, live database by accident (same rule as the other seed scripts)
  require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
  if (process.env.NODE_ENV === 'production' && !options.force) {
    console.error('Refusing to touch a PRODUCTION database. Add --force if you really mean it.')
    process.exit(1)
  }

  const mongoose = require('mongoose')
  const { connect, disconnect } = require('./_connect')
  require('../models/account-model') // registers "Account"
  require('../models/assignments-model') // registers "Assignments"
  require('../models/schools-model') // registers "Schools"
  require('../models/shows-model') // registers "Shows"
  require('../models/incidents-model') // registers "Incident"
  const Incident = mongoose.model('Incident')
  const oldFilter = { slotId: { $regex: `^${SEED_PREFIX}` } } // only incidents made by this script

  await connect()
  try {
    if (options.remove) {
      const count = await Incident.countDocuments(oldFilter)
      if (count && (await confirm(`This deletes ${count} seeded incidents (real reports are not touched).`, options.yes))) {
        console.log(`Deleted ${(await Incident.deleteMany(oldFilter)).deletedCount} seeded incidents.`)
      } else console.log('Nothing deleted.')
      return
    }

    const { candidates, warnings } = await fetchCandidates(mongoose, options)
    warnings.slice(0, 10).forEach((w) => console.log('Warning:', w))
    console.log(`Found ${candidates.length} assigned volunteers (buses) to report from.`)
    if (candidates.length === 0) {
      console.log('NOTHING WAS CREATED: no volunteer is assigned to a school, so nobody can report an incident yet.')
      await explainEmpty(mongoose, options)
      return
    }

    const { docs, summary } = buildIncidents(candidates, options.now, () => new mongoose.Types.ObjectId(), options.rate, options.seed)
    printReport(docs, summary)

    // Check every document against the real schema BEFORE saving anything (same idea as validateMany in assignments-model.js)
    const problems = docs.map((d) => new Incident(d).validateSync()).filter(Boolean)
    if (problems.length) throw new Error(`${problems.length} incidents failed validation, e.g. ${problems[0].message}`)

    if (options.dryRun) {
      console.log('\nDRY RUN - nothing was written. A few examples:')
      for (const d of docs.slice(0, 5)) {
        console.log(`  [${d.status.padEnd(12)}] ${d.createdAt.toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}  ${d.type.padEnd(16)} ${d.school} / ${d.busNo}`)
        console.log(`      ${d.address}\n      "${d.note.slice(0, 110)}..."`)
      }
      return
    }

    const old = await Incident.countDocuments(oldFilter)
    if (!(await confirm(`About to delete ${old} old seeded incidents and insert ${docs.length} new ones.`, options.yes))) {
      console.log('Cancelled. Nothing was changed.')
      return
    }
    await Incident.deleteMany(oldFilter) // replace, never pile up: running twice gives the same count
    // .collection talks to MongoDB directly, so the createdAt / updatedAt we chose are saved exactly as they are
    // (Mongoose's own insert would overwrite them with "now")
    if (docs.length) await Incident.collection.insertMany(docs)
    // Read it back from the database, so "Inserted" is a fact and not just a hope
    const stored = await Incident.countDocuments(oldFilter)
    console.log(`Inserted ${docs.length} incidents; the database now holds ${stored} seeded incidents (${await Incident.countDocuments()} incidents in total).`)
    if (stored !== docs.length) console.log('WARNING: the numbers differ, something went wrong while saving.')
    console.log('Refresh the HQ incident page to see them.')
  } finally {
    await disconnect()
  }
}

module.exports = { buildIncidents, main, SEED_PREFIX, TYPE_WEIGHTS } // exported so the generator can be tested without a database

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err)
    process.exit(1)
  })
}
