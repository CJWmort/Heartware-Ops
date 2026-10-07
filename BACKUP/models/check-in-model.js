// A volunteer tapping a checkpoint. This is the reliable record. Owner: Chin (F3)
const mongoose = require('mongoose')
const pointSchema = require('./_point')
const { CHECKPOINTS } = require('../utils/constants')

const checkInSchema = new mongoose.Schema(
  {
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true },
    checkpoint: { type: String, enum: CHECKPOINTS, required: true },
    location: { type: pointSchema },
    at: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

checkInSchema.index({ slot: 1, checkpoint: 1 }, { unique: true }) // one check-in per checkpoint

module.exports = mongoose.model('CheckIn', checkInSchema)
