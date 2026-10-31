// Script that creates (or removes) demo volunteers for testing. It refuses to run on a production
// database unless --force is given.
// HOW TO RUN (from the server folder):
//   pnpm run seed:volunteers                    -> creates 400 demo volunteers
//   pnpm run seed:volunteers -- --count=50      -> creates 50 instead (1 to 1000)
//   pnpm run seed:volunteers -- --remove        -> deletes all demo volunteers
//   Add --force only if you really mean to run on a production database.
// Demo login: demo.volunteer001@demo.sg / DemoPass123! (or DEMO_PASSWORD from config.env).
// Run seed:shows and seed:schools first.

const path = require('path')
const schoolsData = require('../data/primary_schools.json')

const DEFAULT_COUNT = 400
const SHOWS = ['NE Show 1', 'NE Show 2', 'NE Show 3', 'NE Show 4']
const EMAIL_DOMAIN = 'demo.sg'
const EMAIL_PREFIX = 'demo.volunteer'
const EMAIL_PATTERN = /^demo\.volunteer\d+@demo\.sg$/
const MIN_GAP_M = 40
const MIN_RADIUS_M = 150
const MAX_RADIUS_M = 1500
const BOUNDS = { latMin: 1.205, latMax: 1.47, lngMin: 103.6, lngMax: 104.04 }

// makeRandom(seed) - a seeded random-number generator (mulberry32): the same seed always gives the
// same sequence, so the 400 demo volunteers are the same every run.
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

// shuffle(list, random) - Fisher-Yates shuffle of a COPY: walk from the end, swap each item with a
// random earlier one.
function shuffle(list, random) {
  const copy = list.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// metresBetween(aLat, aLng, bLat, bLng) - straight-line distance in metres (haversine); used for the
// "not too close" rule.
function metresBetween(aLat, aLng, bLat, bLng) {
  const R = 6371000
  // rad(d) - converts degrees to radians.
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// pad(n, width) - turns a number into text padded with leading zeros, e.g. pad(7, 3) = "007".
const pad = (n, width) => String(n).padStart(width, '0')

const NAME_POOLS = [
  {
    weight: 6,
    first: ['Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Goh', 'Chua', 'Chan', 'Koh', 'Teo', 'Ang', 'Yeo', 'Tay', 'Ho', 'Low', 'Sim', 'Chew', 'Toh', 'Foo'],
    second: ['Jia Hui', 'Xin Yi', 'Zhi Hao', 'Mei Ling', 'Kai Wen', 'Shu Fen', 'Jun Jie', 'Hui Min', 'Yong Sheng', 'Li Ting', 'Jia Wei', 'Pei Shan', 'Wen Hao', 'Si Min', 'Jun Kai', 'Ying Ying', 'Zi Xuan', 'Rui En', 'Hao Ran', 'Xiu Qi'],
  },
  {
    weight: 2,
    first: ['Aisyah', 'Hafiz', 'Nurul', 'Farhan', 'Zulaikha', 'Imran', 'Syafiqah', 'Amirul', 'Nadia', 'Danial', 'Hidayah', 'Irfan', 'Sabrina', 'Faizal', 'Liyana'],
    second: ['Rahman', 'Ismail', 'Abdullah', 'Yusof', 'Hassan', 'Sulaiman', 'Ibrahim', 'Mohamed', 'Osman', 'Salleh', 'Hamid', 'Jaafar'],
  },
  {
    weight: 1.5,
    first: ['Priya', 'Arun', 'Divya', 'Ravi', 'Kavitha', 'Suresh', 'Anjali', 'Vikram', 'Meera', 'Karthik', 'Deepa', 'Naveen'],
    second: ['Nair', 'Kumar', 'Menon', 'Chandran', 'Pillai', 'Raj', 'Subramaniam', 'Krishnan', 'Naidu', 'Iyer', 'Rao', 'Sharma'],
  },
]

// allNames(random) - builds every first-name x second-name combination from the name pools and
// shuffles them.
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

// pickNames(count, random) - picks `count` unique names with Chinese names more likely (sort by random
// / weight). Throws if there are not enough names.
function pickNames(count, random) {
  const names = allNames(random)
  const ordered = names
    .map((n) => ({ name: n.name, key: random() / n.weight }))
    .sort((x, y) => x.key - y.key)
    .map((n) => n.name)
  if (ordered.length < count) {
    throw new Error(`Only ${ordered.length} unique names are available, but ${count} were asked for. Add more names.`)
  }
  return ordered.slice(0, count)
}

// makeLocations(count, random) - unique home points near real schools. 1) shuffle the schools 2) for
// each volunteer go to the next school 3) try up to 200 random spots 150 to 1500 m away 4) accept a
// spot only if it is inside Singapore's bounding box and at least 40 m from everyone placed 5) return
// the points.
function makeLocations(count, random) {
  const schools = shuffle(schoolsData.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)), random)
  if (schools.length === 0) throw new Error('No schools with coordinates found in data/primary_schools.json')

  const placed = []
  for (let i = 0; i < count; i++) {
    const school = schools[i % schools.length]
    let point = null

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

// buildVolunteers(count, seed) - builds the demo records (no database). 1) pick names and locations 2)
// every volunteer skips exactly one show (evenly spread) 3) build name, email, phone, postal code,
// address, role, availableShows, lat, lng.
function buildVolunteers(count = DEFAULT_COUNT, seed = 2027) {
  const random = makeRandom(seed)
  const names = pickNames(count, random)
  const locations = makeLocations(count, random)

  const skip = shuffle(Array.from({ length: count }, (_, i) => i % SHOWS.length), random)

  return names.map((name, i) => {
    const where = locations[i]
    const sector = String(where.school.postalCode).slice(0, 2)
    return {
      name,
      email: `${EMAIL_PREFIX}${pad(i + 1, 3)}@${EMAIL_DOMAIN}`,
      phone: `${i % 2 === 0 ? '9' : '8'}${pad(1000000 + i * 7, 7)}`,
      postalCode: sector + pad(Math.floor(random() * 10000), 4),
      address: `Demo home near ${where.school.name}`,
      role: 'volunteer',
      availableShows: SHOWS.filter((_, s) => s !== skip[i]),
      lat: where.lat,
      lng: where.lng,
    }
  })
}

// readOptions(argv) - reads --count (1 to 1000), --remove and --force from the command line.
function readOptions(argv) {
  const countArg = argv.find((a) => a.startsWith('--count='))
  const count = countArg ? Number(countArg.split('=')[1]) : DEFAULT_COUNT
  if (!Number.isInteger(count) || count < 1 || count > 1000) {
    throw new Error('--count must be a whole number between 1 and 1000')
  }
  return { count, remove: argv.includes('--remove'), force: argv.includes('--force') }
}

// main() - 1) read the options, 2) refuse to run on a production database without --force, 3) connect
// and register the models, 4) --remove deletes the demo accounts (matched by a strict email pattern)
// and their rows, otherwise create the demo volunteers and their assignment rows, 5) print a summary
// and disconnect.
async function main() {
  const options = readOptions(process.argv.slice(2))

  require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
  if (process.env.NODE_ENV === 'production' && !options.force) {
    console.error('Refusing to touch a PRODUCTION database. Add --force if you really mean it.')
    process.exit(1)
  }

  const mongoose = require('mongoose')
  const { connect, disconnect } = require('./_connect')
  require('../models/account-model')
  require('../models/assignments-model')
  require('../models/locations-model')
  const Account = mongoose.model('Account')

  await connect()

  if (options.remove) {
    const demo = await Account.find({ email: { $regex: EMAIL_PATTERN } }).select('_id')
    const ids = demo.map((d) => d._id)
    const assignments = await mongoose.model('Assignments').deleteMany({ volunteer: { $in: ids } })
    const locations = await mongoose.model('Locations').deleteMany({ volunteer: { $in: ids } })
    const accounts = await Account.deleteMany({ _id: { $in: ids } })
    console.log(`Removed ${accounts.deletedCount} demo volunteers, ${assignments.deletedCount} of their assignments, ${locations.deletedCount} locations.`)
    await disconnect()
    return
  }

  const bcrypt = require('bcrypt')
  const demoPassword = process.env.DEMO_PASSWORD || 'DemoPass123!'
  const hashed = await bcrypt.hash(demoPassword, 10)

  const volunteers = buildVolunteers(options.count)
  let created = 0
  let updated = 0
  const skipped = []

  for (const v of volunteers) {
    try {
      const result = await Account.updateOne(
        { email: v.email },
        { $set: { ...v, password: hashed, withdrawnShows: [] } },
        { upsert: true },
      )
      if (result.upsertedCount) created++
      else updated++
    } catch (error) {
      skipped.push(`${v.email}: ${error.code === 11000 ? 'phone already used by another account' : error.message}`)
    }
  }

  const perShow = SHOWS.map((s) => `${s}: ${volunteers.filter((v) => v.availableShows.includes(s)).length}`)
  console.log(`Demo volunteers - created ${created}, updated ${updated}, skipped ${skipped.length}`)
  console.log(`Volunteers available per show -> ${perShow.join('  |  ')}`)
  console.log(`Log in as any of them, e.g. ${volunteers[0].email} / ${demoPassword}`)
  if (skipped.length) console.log('Skipped:\n  ' + skipped.join('\n  '))
  await disconnect()
}

module.exports = { buildVolunteers, EMAIL_PATTERN, SHOWS }

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
