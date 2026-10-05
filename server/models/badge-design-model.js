// A volunteer's custom physical badge design. Owner: Hanafi (F5)
const mongoose = require('mongoose')
const { BADGE_SHAPES } = require('../utils/constants')

const badgeDesignSchema = new mongoose.Schema(
  {
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true, unique: true },
    shape: { type: String, enum: BADGE_SHAPES, default: 'circle' },
    primaryColor: { type: String, default: '#d6001c', match: /^#[0-9a-fA-F]{6}$/ },
    secondaryColor: { type: String, default: '#ffffff', match: /^#[0-9a-fA-F]{6}$/ },
    emblem: { type: String, default: 'heart' }, // key into the emblem list on the client
    ribbonText: { type: String, maxlength: 20, default: '' },
    locked: { type: Boolean, default: false }, // true once ordered
  },
  { timestamps: true },
)

module.exports = mongoose.model('BadgeDesign', badgeDesignSchema)
