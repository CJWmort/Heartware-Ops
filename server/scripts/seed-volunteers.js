// Creates 400 DEMO volunteers spread around Singapore, so the allocation has something realistic to work on.
// Run with:     pnpm run seed:volunteers                (create / refresh the demo volunteers)
//               pnpm run seed:volunteers -- --count=150 (a different number)
//               pnpm run seed:volunteers -- --remove    (delete ALL demo volunteers again)
//
// What you get (WHY each choice was made is written beside it):
//  - 400 accounts, every one with a different name, email, phone and map position.
//  - Each volunteer ticks 3 of the 4 shows, and the "missing" show is spread evenly, so every show gets
//    about 300 volunteers: enough to fill all ~250-283 places per show AND leave a reserve list.
//  - Safe to run twice: accounts are matched by email and updated, never duplicated.
//  - Everything uses the email pattern demo.volunteerNNN@demo.sg, so --remove only deletes demo accounts.

const path = require('path')
const schoolsData = require('../data/primary_schools.json') // used only to place volunteers on LAND, near real schools

// ---------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------
const DEFAULT_COUNT = 400
const SHOWS = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const EMAIL_DOMAIN = 'demo.sg'
const EMAIL_PREFIX = 'demo.volunteer'
const EMAIL_PATTERN = /^demo\.volunteer\d+@demo\.sg$/ // exact pattern: --remove can never touch a real account
const MIN_GAP_M = 40 // no two volunteers closer than this, so "different locations" is really true
const MIN_RADIUS_M = 150 // volunteers live a little way from a school, not on top of it
const MAX_RADIUS_M = 1500 // ...but within roughly one neighbourhood, so they stay on land
const BOUNDS = { latMin: 1.205, latMax: 1.47, lngMin: 103.6, lngMax: 104.04 } // the island, a safety net only

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

// Seeded random numbers (mulberry32). WHY: the same seed gives the same 400 people every time, which is what makes
// the script safe to re-run (same emails, same names) and makes your test results repeatable.
function makeRandom(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fisher-Yates shuffle with our seeded random (a copy is shuffled, the original is untouched)
function shuffle(list, random) {
  const copy = list.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Distance in metres between two points (haversine). Used only for the "not too close" rule.
function metresBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const pad = (n, width) => String(n).padStart(width, '0')

// ---------------------------------------------------------------------------------------------
// Names: a mix of Chinese, Malay and Indian names, as in Singapore.
// WHY full-name combinations: Account.name is UNIQUE in the database, so every volunteer needs a different name.
// We list every possible combination, shuffle them, and take the first N, so no two can ever match.
// ---------------------------------------------------------------------------------------------
const NAME_POOLS = [
  { // Chinese: surname first
    weight: 6,
    first: ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Goh', 'Chua', 'Chan', 'Koh', 'Teo', 'Ang', 'Yeo', 'Tay', 'Ho', 'Low', 'Sim', 'Chew', 'Toh', 'Foo'],
    second: ['Jia Hui', 'Xin Yi', 'Zhi Hao', 'Mei Ling', 'Kai Wen', 'Shu Fen', 'Jun Jie', 'Hui Min', 'Yong Sheng', 'Li Ting', 'Jia Wei', 'Pei Shan', 'Wen Hao', 'Si Min', 'Jun Kai', 'Ying Ying', 'Zi Xuan', 'Rui En', 'Hao Ran', 'Xiu Qi'],
  },
  { // Malay: given name first
    weight: 2,
    first: ['Aisyah', 'Hafiz', 'Nurul', 'Farhan', 'Zulaikha', 'Imran', 'Syafiqah', 'Amirul', 'Nadia', 'Danial', 'Hidayah', 'Irfan', 'Sabrina', 'Faizal', 'Liyana'],
    second: ['Rahman', 'Ismail', 'Abdullah', 'Yusof', 'Hassan', 'Sulaiman', 'Ibrahim', 'Mohamed', 'Osman', 'Salleh', 'Hamid', 'Jaafar'],
  },
  { // Indian: given name first
    weight: 1.5,
    first: ['Priya', 'Arun', 'Divya', 'Ravi', 'Kavitha', 'Suresh', 'Anjali', 'Vikram', 'Meera', 'Karthik', 'Deepa', 'Naveen'],
    second: ['Nair', 'Kumar', 'Menon', 'Chandran', 'Pillai', 'Raj', 'Subramaniam', 'Krishnan', 'Naidu', 'Iyer', 'Rao', 'Sharma'],
  },
]

// Build the full list of unique names, shuffled
function allNames(random) {
  const names = []
  for (const pool of NAME_POOLS) {
    for (const a of pool.first) {
      for (const b of pool.second) {
        names.push({ name: `${a} ${b}`, weight: pool.weight })
      }
    }
  }
  return shuffle(names, random)
}

// Pick `count` unique names. Chinese names are listed more often so the mix looks like Singapore's, while still
// never repeating a name (each combination appears once in the list).
function pickNames(count, random) {
  const names = allNames(random)
  // weighted order: sort by (random / weight) so heavier pools come earlier on average
  const ordered = names
    .map((n) => ({ name: n.name, key: random() / n.weight }))
    .sort((x, y) => x.key - y.key)
    .map((n) => n.name)
  if (ordered.length < count) {
    throw new Error(`Only ${ordered.length} unique names are available, but ${count} were asked for. Add more names.`)
  }
  return ordered.slice(0, count)
}

// ---------------------------------------------------------------------------------------------
// Locations: unique points around real schools.
// WHY near schools: schools are spread over the whole island, so points near them are on land and give a spread over
// every region. Using plain random coordinates inside a box would put many volunteers in the sea or in Malaysia.
// ---------------------------------------------------------------------------------------------
function makeLocations(count, random) {
  const schools = shuffle(schoolsData.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)), random)
  if (schools.length === 0) throw new Error('No schools with coordinates found in data/primary_schools.json')

  const placed = []
  for (let i = 0; i < count; i++) {
    // Go round the (shuffled) schools one by one so every part of Singapore is covered before any repeats
    const school = schools[i % schools.length]
    let point = null

    // Try up to 200 random spots near this school until one is far enough from everyone else already placed
    for (let attempt = 0; attempt < 200 && !point; attempt++) {
      const bearing = random() * 2 * Math.PI
      const metres = MIN_RADIUS_M + random() * (MAX_RADIUS_M - MIN_RADIUS_M)
      const lat = school.lat + (metres * Math.cos(bearing)) / 111320
      const lng = school.lng + (metres * Math.sin(bearing)) / (111320 * Math.cos((school.lat * Math.PI) / 180))

      const insideIsland = lat > BOUNDS.latMin && lat < BOUNDS.latMax && lng > BOUNDS.lngMin && lng < BOUNDS.lngMax
      const farEnough = placed.every((p) => metresBetween(lat, lng, p.lat, p.lng) >= MIN_GAP_M)
      if (insideIsland && farEnough) point = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), school }
    }
    if (!point) throw new Error(`Could not find a free spot near "${school.name}" - lower --count or MIN_GAP_M.`)
    placed.push(point)
  }
  return placed
}

// ---------------------------------------------------------------------------------------------
// Build the volunteer records (pure function: no database, easy to test)
// ---------------------------------------------------------------------------------------------
function buildVolunteers(count = DEFAULT_COUNT, seed = 2027) {
  const random = makeRandom(seed)
  const names = pickNames(count, random)
  const locations = makeLocations(count, random)

  // Every volunteer skips exactly ONE show. Cycling 0,1,2,3,... and shuffling gives each show the same number of
  // skippers, so each show ends up with count * 3/4 volunteers (300 when count = 400).
  const skip = shuffle(Array.from({ length: count }, (_, i) => i % SHOWS.length), random)

  return names.map((name, i) => {
    const where = locations[i]
    const sector = String(where.school.postalCode).slice(0, 2) // first 2 digits = postal sector, so the code looks local
    return {
      name,
      email: `${EMAIL_PREFIX}${pad(i + 1, 3)}@${EMAIL_DOMAIN}`,
      // 8 or 9 start = a Singapore mobile number; the running number keeps every phone unique (the schema requires it)
      phone: `${i % 2 === 0 ? '9' : '8'}${pad(1000000 + i * 7, 7)}`,
      postalCode: sector + pad(Math.floor(random() * 10000), 4), // made up: demo only, NOT a real address
      address: `Demo home near ${where.school.name}`,
      role: 'volunteer',
      availableShows: SHOWS.filter((_, s) => s !== skip[i]),
      lat: where.lat,
      lng: where.lng,
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Database part
// ---------------------------------------------------------------------------------------------
function readOptions(argv) {
  const countArg = argv.find((a) => a.startsWith('--count='))
  const count = countArg ? Number(countArg.split('=')[1]) : DEFAULT_COUNT
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('--count must be a whole number between 1 and 1000')
  }
  return { count, remove: argv.includes('--remove'), force: argv.includes('--force') }
}

async function main() {
  const options = readOptions(process.argv.slice(2))

  // Safety: demo data must never land in a real, live database by accident
  require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
  if (process.env.NODE_ENV === 'production' && !options.force) {
    console.error('Refusing to touch a PRODUCTION database. Add --force if you really mean it.')
    process.exit(1)
  }

  const mongoose = require('mongoose')
  const { connect, disconnect } = require('./_connect')
  require('../models/account-model') // registers the "Account" model
  require('../models/assignments-model') // registers "Assignments" (needed to clean up on --remove)
  require('../models/locations-model') // registers "Locations"  (needed to clean up on --remove)
  const Account = mongoose.model('Account')

  await connect()

  if (options.remove) {
    // Find the demo accounts first, so we can also remove what points at them (otherwise the board would show blanks)
    const demo = await Account.find({ email: { $regex: EMAIL_PATTERN } }).select('_id')
    const ids = demo.map((d) => d._id)
    const assignments = await mongoose.model('Assignments').deleteMany({ volunteer: { $in: ids } })
    const locations = await mongoose.model('Locations').deleteMany({ volunteer: { $in: ids } })
    const accounts = await Account.deleteMany({ _id: { $in: ids } })
    console.log(`Removed ${accounts.deletedCount} demo volunteers, ${assignments.deletedCount} of their assignments, ${locations.deletedCount} locations.`)
    await disconnect()
    return
  }

  // One shared password for every demo account. Hashed ONCE and reused: the same text gives a different hash each
  // time, but any of them is valid, and 400 separate hashes would just make the script slow.
  const bcrypt = require('bcrypt')
  const demoPassword = process.env.DEMO_PASSWORD || 'DemoPass123!'
  const hashed = await bcrypt.hash(demoPassword, 10)

  const volunteers = buildVolunteers(options.count)
  let created = 0
  let updated = 0
  const skipped = []

  for (const v of volunteers) {
    try {
      // upsert by email: create if new, refresh if it already exists -> running twice never duplicates anybody
      // CHANGED: besides refreshing the demo account, also set withdrawnShows back to an empty list.
      // WHY: expired/declined offers are logged there, so without this the old "No response within 24 hours"
      // entries pile up and each demo volunteer never gets a clean slate. This only touches accounts that match
      // the demo email (the filter below), so a real volunteer's history can never be cleared by this script.
      const result = await Account.updateOne(
        { email: v.email }, // only the demo account with this email
        { $set: { ...v, password: hashed, withdrawnShows: [] } }, // refresh details AND wipe the decline/withdraw history
        { upsert: true }, // create it if it doesn't exist yet
      )
      if (result.upsertedCount) created++
      else updated++
    } catch (error) {
      // Most likely a name or phone number that a REAL account already uses (both are unique in the schema)
      skipped.push(`${v.email}: ${error.code === 11000 ? 'name or phone already used by another account' : error.message}`)
    }
  }

  const perShow = SHOWS.map((s) => `${s}: ${volunteers.filter((v) => v.availableShows.includes(s)).length}`)
  console.log(`Demo volunteers - created ${created}, updated ${updated}, skipped ${skipped.length}`)
  console.log(`Volunteers available per show -> ${perShow.join('  |  ')}`)
  console.log(`Log in as any of them, e.g. ${volunteers[0].email} / ${demoPassword}`)
  if (skipped.length) console.log('Skipped:\n  ' + skipped.join('\n  '))
  await disconnect()
}

module.exports = { buildVolunteers, EMAIL_PATTERN, SHOWS } // exported so the generator can be tested without a database

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
