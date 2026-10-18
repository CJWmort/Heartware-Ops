const mongoose = require("mongoose");

// Create a new 'shows' schema
// One document = one NDP show (e.g. 'NE Show 1') with its date and venue
const ShowsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  // stored as "YYYY-MM-DD" so it sorts in date order
  date: {
    type: String,
    required: true,
    match: [/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"],
  },
  venue: {
    type: String,
    required: true,
    trim: true,
  },
});
// 'shows' refer to the 'shows' collection in our database
const Shows = mongoose.model("Shows", ShowsSchema, "shows");

// ===== READ =====

// Fetch all shows, earliest first
exports.retrieveAll = function () {
  return Shows.find().sort({ date: 1 });
};

// Fetch one show by _id
exports.findById = function (id) {
  return Shows.findById(id);
};

// Fetch one show by exact name (case-insensitive), e.g. 'NE Show 1'
exports.findByName = function (name) {
  return Shows.findOne({ name: new RegExp("^" + escapeRegex(name.trim()) + "$", "i") });
};

// Fetch all shows on a date ("YYYY-MM-DD")
exports.findByDate = function (date) {
  return Shows.find({ date: date.trim() }).sort({ name: 1 });
};

// Helper: escape special regex characters in user input
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
