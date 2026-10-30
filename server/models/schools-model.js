// The school database model (name, address, position, shows, classes, reporting time).

const mongoose = require("mongoose");

const SchoolsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  address: {
    type: String,
    required: true,
    unique: true,
  },
  postalCode: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{6}$/, "Please enter a valid 6-digit Singapore postal code"],
  },
  zone: {
    type: String,
    required: true,
  },
  lat: {
    type: Number,
    required: true,
  },
  lng: {
    type: Number,
    required: true,
  },
  p5Classes: {
    type: Number,
    required: true,
  },
  reportingTime: {
    type: String,
    required: true,
  },
  show: {
    type: String,
    required: true,
  },
});
const Schools = mongoose.model("Schools", SchoolsSchema, "schools");

// retrieveAll() - all schools sorted by name.
exports.retrieveAll = function () {
  return Schools.find().sort({ name: 1 });
};

// findByName(name) - exact name, ignoring upper/lower case. escapeRegex() first neutralises special
// characters so user text cannot act as a pattern.
exports.findByName = function (name) {
  return Schools.findOne({ name: new RegExp("^" + escapeRegex(name.trim()) + "$", "i") });
};

// findByShow(show) - schools of one show, sorted by name.
exports.findByShow = function (show) {
  return Schools.find({ show: show.trim() }).sort({ name: 1 });
};

// findByPostalCode(postalCode) - the school with that postal code.
exports.findByPostalCode = function (postalCode) {
  return Schools.findOne({ postalCode: postalCode.trim() });
};

// escapeRegex(text) - puts a backslash in front of characters that have a special meaning in regular
// expressions, so they are matched literally.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
