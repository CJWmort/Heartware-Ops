// Loads MOCK demo data so everyone can develop and test without real sign-ups.
// Run with:  npm run seed:demo        (safe to run again – it wipes demo data first)
//
// Creates:
//   coordinator@demo.sg / hq@demo.sg / volunteer1..N@demo.sg   password: Password123!
//   mock volunteers   (data/mock-volunteers.json – fake names, approximate town locations)
//   mock schools      (data/mock-schools.json – only if no real schools are seeded yet)
//   show dates        (data/events.json)
//   badge catalogue   (data/badges.json)

const bcrypt = require('bcryptjs')
const { connect, disconnect } = require('./_connect')
const { User, Volunteer, School, Event, Badge } = require('../models')
const { toPoint } = require('../utils/geo')
const { CHECKPOINTS } = require('../utils/constants')

const DEMO_PASSWORD = 'Password123!'
const DEMO_DOMAIN = /@demo\.sg$/

const mockVolunteers = require('../data/mock-volunteers.json')
const mockSchools = require('../data/mock-schools.json')
const events = require('../data/events.json')
const badges = require('../data/badges.json')

// Rough expected times (minutes after the event's start time) for each checkpoint – used by F4 alerts
const SCHEDULE_OFFSETS_MIN = [-180, -165, -105, -60, 150, 210]

async function main() {
  await connect()
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)

  // 1. Remove old demo users + their volunteer profiles
  const oldUsers = await User.find({ email: DEMO_DOMAIN }).select('_id')
  await Volunteer.deleteMany({ user: { $in: oldUsers.map((u) => u._id) } })
  await User.deleteMany({ email: DEMO_DOMAIN })

  // 2. Staff accounts
  await User.create([
    { name: 'Demo Coordinator', email: 'coordinator@demo.sg', passwordHash, role: 'coordinator' },
    { name: 'Demo HQ', email: 'hq@demo.sg', passwordHash, role: 'hq' },
  ])

  // 3. Volunteers
  for (const v of mockVolunteers) {
    const user = await User.create({
      name: v.name,
      email: v.email,
      phone: v.phone,
      passwordHash,
      role: 'volunteer',
    })
    await Volunteer.create({
      user: user._id,
      postalCode: v.postalCode,
      address: `${v.town} (mock address)`,
      location: toPoint(v.lat, v.lng),
      availableDates: v.availableDates.map((d) => new Date(`${d}T00:00:00+08:00`)),
      consent: { location: true, givenAt: new Date() },
    })
  }
  console.log(`✔ ${mockVolunteers.length} volunteers + 2 staff accounts (password: ${DEMO_PASSWORD})`)

  // 4. Schools – only use mock schools if the real seed hasn't run
  const realSchools = await School.countDocuments({ zone: { $ne: 'MOCK' } })
  if (realSchools === 0) {
    await School.deleteMany({ zone: 'MOCK' })
    await School.create(
      mockSchools.map((s) => ({ ...s, location: toPoint(s.lat, s.lng) })),
    )
    console.log(`✔ ${mockSchools.length} MOCK schools (run seed:schools for real ones)`)
  } else {
    console.log(`✔ ${realSchools} real schools already present – mock schools skipped`)
  }

  // 5. Events with a checkpoint schedule
  await Event.deleteMany({ name: { $in: events.map((e) => e.name) } })
  await Event.create(
    events.map((e) => {
      const start = new Date(e.date)
      return {
        ...e,
        checkpointSchedule: CHECKPOINTS.map((checkpoint, i) => ({
          checkpoint,
          expectedAt: new Date(start.getTime() + SCHEDULE_OFFSETS_MIN[i] * 60 * 1000),
        })),
      }
    }),
  )
  console.log(`✔ ${events.length} events`)

  // 6. Badge catalogue
  for (const b of badges) {
    await Badge.updateOne({ code: b.code }, b, { upsert: true })
  }
  console.log(`✔ ${badges.length} badges`)

  await disconnect()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
