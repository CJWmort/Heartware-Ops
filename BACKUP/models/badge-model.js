// Badge catalogue (what badges exist). Owner: Hanafi (F5)
const mongoose = require('mongoose')

const badgeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // e.g. "FULL_ROUTE"
    name: { type: String, required: true }, // e.g. "Full Route Completed"
    description: { type: String },
    icon: { type: String }, // Bootstrap Icons name, e.g. "bi-flag-fill"
    awardType: { type: String, enum: ['auto', 'manual'], default: 'manual' },
  },
  { timestamps: true },
)

module.exports = mongoose.model('Badge', badgeSchema)
