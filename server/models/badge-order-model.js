const mongoose = require("mongoose");
const shapeList = ['circle', 'hexagon', 'star', 'shield']
const emblemList = ['heart', 'star', 'crescent', 'trophy', 'smile', 'balloon']
const statusList = ['placed', 'in_production', 'shipped', 'delivered']

const badgeOrderSchema = new mongoose.Schema(
    {
        volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
        designSnapshot: {
            shape:          { type: String, enum: shapeList },
            primaryColor:   { type: String, match: /^#[0-9a-fA-F]{6}$/ },
            secondaryColor: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
            emblem:         { type: String, enum: emblemList },
            ribbonText:     { type: String, maxlength: 20 },
        },
        address: {
            line1:      { type: String, required: true },
            unit:       { type: String },
            postalCode: { type: String, required: true, match: /^\d{6}$/ },
        },
        status:     { type: String, enum: statusList, default: 'placed' },
    },
    { timestamps: true },
);

const BadgeOrder = mongoose.model('BadgeOrder', badgeOrderSchema, 'badgeorders');

exports.create = (order) => BadgeOrder.create(order)
exports.findByVolunteer = (volunteerId) => BadgeOrder.find({ volunteer: volunteerId }).sort({ createdAt: -1 })

