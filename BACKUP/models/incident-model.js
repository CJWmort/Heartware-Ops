// An incident reported by a volunteer. Owner: Wei Ming (F4)
const mongoose = require('mongoose')
const pointSchema = require('./_point')
const { INCIDENT_TYPES, INCIDENT_STATUS, SEVERITY } = require('../utils/constants')

const incidentSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot' },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: INCIDENT_TYPES, required: true },
    severity: { type: String, enum: SEVERITY, default: 'medium' },
    note: { type: String, maxlength: 500 },
    photoUrl: { type: String }, // small base64 data URL or a hosted image URL
    location: { type: pointSchema },
    status: { type: String, enum: INCIDENT_STATUS, default: 'new' },
    history: [
      {
        status: { type: String, enum: INCIDENT_STATUS },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
)

module.exports = mongoose.model('Incident', incidentSchema)
