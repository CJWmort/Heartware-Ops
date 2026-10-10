const mongoose = require("mongoose");
const BADGES = require("../data/badges.json");
const SCHEDULE = require("../data/schedule.json");

const BADGE_CODES = BADGES.map((b) => b.code);  
const SCHEDULE_NAMES = SCHEDULE.map((e) => e.name); 

const badgeAwardSchema = new mongoose.Schema(
    {
        badge:     { type: String, enum: BADGE_CODES, required: true },
        volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
        event:     { type: String, enum: SCHEDULE_NAMES},
        awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },          
        message:   { type: String, maxlength: 300 },
    },
    { timestamps: true },
);

badgeAwardSchema.index({ badge: 1, volunteer: 1, event: 1 }, { unique: true });

const BadgeAward = mongoose.model('BadgeAward', badgeAwardSchema, 'badgeawards');
exports.create = (award) => BadgeAward.create(award);
exports.retrieveByVolunteer = (volunteerId) => BadgeAward.find({volunteer: volunteerId}).sort({ createdAt: -1 });


