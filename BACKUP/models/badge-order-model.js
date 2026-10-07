// Physical badge order + delivery tracking. Owner: Hanafi (F5)
const mongoose = require('mongoose')
const { ORDER_STATUS } = require('../utils/constants')

const badgeOrderSchema = new mongoose.Schema(
  {
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true },
    designSnapshot: { type: mongoose.Schema.Types.Mixed, required: true }, // copy of design at order time
    address: {
      line1: { type: String, required: true },
      unit: String,
      postalCode: { type: String, required: true, match: /^\d{6}$/ },
    },
    status: { type: String, enum: ORDER_STATUS, default: 'placed' },
    history: [
      {
        status: { type: String, enum: ORDER_STATUS },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
)

module.exports = mongoose.model('BadgeOrder', badgeOrderSchema)
