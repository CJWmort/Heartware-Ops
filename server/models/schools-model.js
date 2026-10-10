const mongoose = require('mongoose');

// Create a new 'account' schema
const SchoolsSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    address: {
        type: String,
        required: true,
        unique: true
    },
    postalCode: {
        type: String,
        required: true,
        trim: true,
        match: [/^\d{6}$/, 'Please enter a valid 6-digit Singapore postal code']
    },
    zone: {
        type: String,
        required: true,
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    },
    p5Classes: {
        type: Number,
        required: true
    }
});
// 'account' refer to the 'accounts' collection in our database
const Schools = mongoose.model('Schools', SchoolsSchema, 'schools');

// ===== READ =====
 
// Fetch all schools, sorted by name
exports.retrieveAll = function () {
    return Schools.find().sort({ name: 1 });
};
 
// Fetch one school by its MongoDB _id
exports.findById = function (id) {
    return Schools.findById(id);
};
 
// Fetch one school by exact name (case-insensitive)
exports.findByName = function (name) {
    return Schools.findOne({ name: new RegExp('^' + escapeRegex(name.trim()) + '$', 'i') });
};
 
// Fetch all schools in a zone (e.g. 'NORTH', 'SOUTH')
exports.findByZone = function (zone) {
    return Schools.find({ zone: zone.trim().toUpperCase() }).sort({ name: 1 });
};
 
// Fetch one school by postal code
exports.findByPostalCode = function (postalCode) {
    return Schools.findOne({ postalCode: postalCode.trim() });
};
 
// ===== DELETE =====

// Delete one school by its MongoDB _id (returns the deleted doc, or null)
exports.deleteById = function (id) {
    return Schools.findByIdAndDelete(id);
};
 
// Delete one school by exact name (case-insensitive)
exports.deleteByName = function (name) {
    return Schools.findOneAndDelete({ name: new RegExp('^' + escapeRegex(name.trim()) + '$', 'i') });
};
 
// Helper: escape special regex characters in user input
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}