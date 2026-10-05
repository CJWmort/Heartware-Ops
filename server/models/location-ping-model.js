// Location sent every 5 minutes while the tracking page is open. Owner: Chin (F3)
const mongoose = require('mongoose')
const pointSchema = require('./_point')

const locationPingSchema = new mongoose.Schema({
  slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
  volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true },
  location: { type: pointSchema, required: true },
  accuracy: { type: Number }, // metres, from the browser Geolocation API
  at: { type: Date, default: Date.now },
})

locationPingSchema.index({ slot: 1, at: -1 })

module.exports = mongoose.model('LocationPing', locationPingSchema)
