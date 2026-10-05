// Who changed what, and when. Used by F2 history tab (and anyone else who wants it).
const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    slot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true }, // e.g. "DROP_OUT", "CLAIM", "APPROVE", "SWAP", "MANUAL_REASSIGN"
    details: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true },
)

module.exports = mongoose.model('AuditLog', auditLogSchema)
