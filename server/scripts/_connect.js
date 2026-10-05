// Shared helper for scripts: loads config.env and connects to MongoDB.
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', 'config.env') })
const mongoose = require('mongoose')

async function connect() {
  if (!process.env.DB) {
    console.error('No DB in config.env – copy config.env.example to config.env first.')
    process.exit(1)
  }
  await mongoose.connect(process.env.DB)
  console.log('Connected to MongoDB')
}

async function disconnect() {
  await mongoose.disconnect()
}

module.exports = { connect, disconnect }
