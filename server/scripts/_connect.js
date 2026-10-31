// Shared helper for the scripts: connect to and disconnect from MongoDB.
// NOT run directly. The other scripts import it. Needs DB set in server/config.env.

const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
const mongoose = require('mongoose')

// connect() - 1) stop with a message if DB is missing in config.env 2) connect Mongoose to MongoDB 3)
// print "Connected to MongoDB".
async function connect() {
  if (!process.env.DB) {
    console.error('No DB found in server/config.env.')
    process.exit(1)
  }
  await mongoose.connect(process.env.DB)
  console.log('Connected to MongoDB')
}

// disconnect() - closes the MongoDB connection so the script can exit.
async function disconnect() {
  await mongoose.disconnect()
}

module.exports = { connect, disconnect }
