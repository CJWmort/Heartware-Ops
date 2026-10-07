// A show date (e.g. NE Show 1 at the National Stadium). Owner: Kuah / Fanny
const mongoose = require('mongoose')
const { VENUES, CHECKPOINTS } = require('../utils/constants')

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // "NE Show 1"
    date: { type: Date, required: true },
    venue: { type: String, enum: VENUES, required: true },
    status: {
      type: String,
      enum: ['planning', 'published', 'live', 'completed'],
      default: 'planning',
    },
    // Expected time for each checkpoint – F4 uses these to raise overdue alerts
    checkpointSchedule: [
      {
        checkpoint: { type: String, enum: CHECKPOINTS },
        expectedAt: Date,
        graceMinutes: { type: Number, default: 15 },
      },
    ],
  },
  { timestamps: true },
)

module.exports = mongoose.model('Event', eventSchema)
