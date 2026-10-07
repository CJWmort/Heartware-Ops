// Two volunteers asking to swap slots. Owner: Yap (F2)
const mongoose = require('mongoose')

const swapSchema = new mongoose.Schema(
  {
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true },
    fromSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    toSlot: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
  },
  { timestamps: true },
)

module.exports = mongoose.model('Swap', swapSchema)
