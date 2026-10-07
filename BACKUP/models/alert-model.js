// Automatic alert: a group missed a checkpoint's expected time. Owner: Wei Ming (F4)
const mongoose = require('mongoose')
const { CHECKPOINTS } = require('../utils/constants')

const alertSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    missedCheckpoint: { type: String, enum: CHECKPOINTS, required: true },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: ['open', 'acknowledged', 'cleared'], default: 'open' },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: Date,
  },
  { timestamps: true },
)

alertSchema.index({ slot: 1, missedCheckpoint: 1 }, { unique: true }) // don't alert twice

module.exports = mongoose.model('Alert', alertSchema)
