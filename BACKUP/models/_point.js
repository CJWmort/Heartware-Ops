// Reusable GeoJSON point sub-schema. coordinates = [lng, lat]  (longitude first!)
// Use utils/geo.js toPoint(lat, lng) to build one.
const mongoose = require('mongoose')

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false },
)

module.exports = pointSchema
