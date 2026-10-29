const mongoose = require("mongoose");
const shapeList = ['circle', 'hexagon', 'star', 'shield']
const emblemList = ['heart', 'star', 'crescent', 'trophy', 'smile', 'balloon']

const badgeDesignSchema = new mongoose.Schema(
    {
        volunteer:      { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true, unique: true },
        shape:          { type: String, enum: shapeList },
        primaryColor:   { type: String, match: /^#[0-9a-fA-F]{6}$/ },
        secondaryColor: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
        emblem:         { type: String, enum: emblemList },
        ribbonText:     { type: String, maxlength: 20 },
        locked:         { type: Boolean , default: false },          
    },
    { timestamps: true },
);

const BadgeDesign = mongoose.model('BadgeDesign', badgeDesignSchema, 'badgedesigns');

exports.findByVolunteer = (volunteerId) => BadgeDesign.findOne({ volunteer: volunteerId })
exports.create = (design) => BadgeDesign.create(design)
// FIX (S2): lock the design in ONE atomic step. The filter only matches an UNLOCKED design, so when two
// requests arrive together only one of them gets the document back; the other gets null and is rejected.
exports.lockIfUnlocked = (volunteerId) =>
    BadgeDesign.findOneAndUpdate({ volunteer: volunteerId, locked: false }, { locked: true }, { new: true })

// FIX (S2): undo the lock if creating the order fails (e.g. bad address), so the volunteer can fix it and try again
exports.unlock = (volunteerId) =>
    BadgeDesign.updateOne({ volunteer: volunteerId }, { locked: false })

