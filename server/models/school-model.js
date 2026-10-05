// Primary school, loaded from data.gov.sg by scripts/seed-schools.js. Owner: Kuah (F1a)
const mongoose = require('mongoose')
const pointSchema = require('./_point')

const schoolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    address: { type: String },
    postalCode: { type: String },
    zone: { type: String }, // NORTH / SOUTH / EAST / WEST from the MOE dataset
    location: { type: pointSchema },
    p5Classes: { type: Number, default: 0 }, // one class = one bus = one volunteer
    contact: {
      teacherName: String,
      phone: String,
    },
  },
  { timestamps: true },
)

schoolSchema.index({ location: '2dsphere' })

module.exports = mongoose.model('School', schoolSchema)
