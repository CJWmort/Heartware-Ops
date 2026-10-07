// A badge given to a volunteer. Owner: Hanafi (F5)
const mongoose = require('mongoose')

const badgeAwardSchema = new mongoose.Schema(
  {
    badge: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true },
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null = automatic
    message: { type: String, maxlength: 300 },
  },
  { timestamps: true },
)

badgeAwardSchema.index({ badge: 1, volunteer: 1, event: 1 }, { unique: true })

module.exports = mongoose.model('BadgeAward', badgeAwardSchema)
