// An open slot created when a volunteer drops out / no-shows. Owner: Yap (F2)
const mongoose = require('mongoose')
const { DROP_OUT_REASONS } = require('../utils/constants')

const replacementSchema = new mongoose.Schema(
  {
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    droppedVolunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer' },
    reason: { type: String, enum: DROP_OUT_REASONS, required: true },
    note: { type: String },
    status: { type: String, enum: ['open', 'filled', 'expired', 'cancelled'], default: 'open' },
    expiresAt: { type: Date }, // drives the countdown on the claim card
    claims: [
      {
        volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer' },
        claimedAt: { type: Date, default: Date.now },
        distanceKm: Number,
      },
    ],
    approvedVolunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Replacement', replacementSchema)
