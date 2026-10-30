// Script that creates the show records.

const { connect, disconnect } = require('./_connect')
const Shows = require('../models/shows-model')
const mongoose = require('mongoose')
const schedule = require('../data/schedule.json')

// main() - loads the shows in data/schedule.json. 1) connect 2) for each show upsert by name (create
// or update date and venue) 3) print each 4) disconnect. Safe to run many times.
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
