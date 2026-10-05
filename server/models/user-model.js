// Login account for every role. Volunteer-specific details live in volunteer-model.js
// Owner: Kuah (F1a)
const mongoose = require('mongoose')
const { ROLES } = require('../utils/constants')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }, // never store plain passwords – use bcryptjs
    role: { type: String, enum: Object.values(ROLES), default: ROLES.VOLUNTEER },
    phone: { type: String, trim: true },
  },
  { timestamps: true },
)

// Never send passwordHash back to the browser
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash
    return ret
  },
})

module.exports = mongoose.model('User', userSchema)
