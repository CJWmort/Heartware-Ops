// Loads the 4 NE Shows from data/schedule.json into the "shows" collection.
// Safe to run many times (updates by name).          Run with:  npm run seed:shows
const { connect, disconnect } = require('./_connect')
const Shows = require('../models/shows-model')
const mongoose = require('mongoose')
const schedule = require('../data/schedule.json')

async function main() {
  await connect()
  const Model = mongoose.model('Shows')
  for (const s of schedule) {
    await Model.updateOne(
      { name: s.name },
      { $set: { name: s.name, date: s.date, venue: s.venue } },
      { upsert: true }
    )
    console.log(`Show ready: ${s.name} (${s.date}, ${s.venue})`)
  }
  await disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
