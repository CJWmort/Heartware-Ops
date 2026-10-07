// One bus = one P5 class = one volunteer, for one event. Owner: Fanny (F1b)
const mongoose = require('mongoose')
const { SLOT_STATUS, CHECKPOINTS } = require('../utils/constants')

const slotSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    busNo: { type: String }, // e.g. "B03"
    className: { type: String }, // e.g. "5A"
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', default: null },
    status: { type: String, enum: SLOT_STATUS, default: 'unassigned' },
    distanceKm: { type: Number }, // volunteer → school, filled in by the algorithm
    respondedAt: { type: Date },
    // Denormalised "latest" tracking info for a fast HQ board (F3 updates these)
    lastCheckpoint: { type: String, enum: [...CHECKPOINTS, null], default: null },
    lastLocationAt: { type: Date },
  },
  { timestamps: true },
)

slotSchema.index({ event: 1, school: 1 })
slotSchema.index({ event: 1, volunteer: 1 })

module.exports = mongoose.model('Slot', slotSchema)
