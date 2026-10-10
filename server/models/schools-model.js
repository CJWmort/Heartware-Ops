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
    },
    reportingTime:{
        type: String, 
        required: true
    },
    show: {
        type: String, 
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
 
// Fetch one school by exact name (case-insensitive)
exports.findByName = function (name) {
    return Schools.findOne({ name: new RegExp('^' + escapeRegex(name.trim()) + '$', 'i') });
};
 
// Fetch all schools in a show (e.g. 'NE Show 1', 'NE Show 2')
exports.findByShow = function (show) {
    return Schools.find({ show: show.trim() }).sort({ name: 1 });
};
 
// Fetch one school by postal code
exports.findByPostalCode = function (postalCode) {
    return Schools.findOne({ postalCode: postalCode.trim() });
};

 
// Helper: escape special regex characters in user input
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}