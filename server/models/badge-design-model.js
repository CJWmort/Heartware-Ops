// The saved badge design database model (one per volunteer, can be locked).

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

// findByVolunteer(volunteerId) - the volunteer's design, or null.
exports.findByVolunteer = (volunteerId) => BadgeDesign.findOne({ volunteer: volunteerId })
// create(design) - saves a new design.
exports.create = (design) => BadgeDesign.create(design)
// lockIfUnlocked(volunteerId) - atomically locks the volunteer's design only if it is currently
// unlocked, and returns the updated design (null if it was already locked); this stops two orders
// going through at once.
exports.lockIfUnlocked = (volunteerId) =>
    BadgeDesign.findOneAndUpdate({ volunteer: volunteerId, locked: false }, { locked: true }, { new: true })

// unlock(volunteerId) - unlocks the volunteer's design again (used to undo the lock when placing an
// order fails).
exports.unlock = (volunteerId) =>
    BadgeDesign.updateOne({ volunteer: volunteerId }, { locked: false })

