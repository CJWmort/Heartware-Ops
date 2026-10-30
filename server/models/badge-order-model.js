// The badge order database model (design, delivery address and status).

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
            unit:       { type: String, required: true, maxlength: 20 },
            postalCode: { type: String, required: true, match: /^\d{6}$/ },
        },
        status:     { type: String, enum: statusList, default: 'placed' },
    },
    { timestamps: true },
);

const BadgeOrder = mongoose.model('BadgeOrder', badgeOrderSchema, 'badgeorders');

// create(order) - saves an order.
exports.create = (order) => BadgeOrder.create(order)
// findByVolunteer(volunteerId) - one volunteer's orders, newest first.
exports.findByVolunteer = (volunteerId) => BadgeOrder.find({ volunteer: volunteerId }).sort({ createdAt: -1 })

exports.STATUS_LIST = statusList
// findAll() - every order, newest first, with the volunteer's name and email filled in.
exports.findAll = () => BadgeOrder.find().sort({ createdAt: -1 }).populate('volunteer', 'name email')
// findById(orderId) - one order.
exports.findById = (orderId) => BadgeOrder.findById(orderId)

