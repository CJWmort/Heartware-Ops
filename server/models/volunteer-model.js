// Volunteer profile (one per volunteer User). Owner: Kuah (F1a)
const mongoose = require('mongoose')
const pointSchema = require('./_point')

const volunteerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    postalCode: { type: String, required: true, match: /^\d{6}$/ },
    address: { type: String }, // from OneMap, for display
    location: { type: pointSchema }, // from OneMap, geocoded ONCE at registration
    availableDates: [{ type: Date }], // show dates the volunteer can attend
    consent: {
      location: { type: Boolean, required: true }, // must be true to register
      givenAt: { type: Date },
    },
    // simple reliability stats used by F2 compare panel
    stats: {
      eventsCompleted: { type: Number, default: 0 },
      dropOuts: { type: Number, default: 0 },
      replacementsTaken: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
)

volunteerSchema.index({ location: '2dsphere' }) // enables $near / $geoWithin queries

module.exports = mongoose.model('Volunteer', volunteerSchema)
