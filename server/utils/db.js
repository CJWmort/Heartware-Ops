const mongoose = require('mongoose')

// Connects to MongoDB using the DB value in config.env.
// If DB is missing we still start the server (so frontend work isn't blocked),
// but any route that touches the database will fail until it is set.
async function connectDB() {
  if (!process.env.DB) {
    console.warn('⚠️  No DB in config.env – starting WITHOUT a database.')
    return
  }
  try {
    await mongoose.connect(process.env.DB)
    console.log('MongoDB connected successfully')
  } catch (error) {
    console.error('MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

module.exports = connectDB
