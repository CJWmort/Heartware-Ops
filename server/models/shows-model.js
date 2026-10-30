// The show database model (name, date and place).

const mongoose = require("mongoose");

const ShowsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
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
const Shows = mongoose.model("Shows", ShowsSchema, "shows");

// retrieveAll() - all shows, earliest first.
exports.retrieveAll = function () {
  return Shows.find().sort({ date: 1 });
};

// findById(id) - one show by id.
exports.findById = function (id) {
  return Shows.findById(id);
};

// findByName(name) - one show by name, ignoring upper/lower case (special characters are escaped
// first).
exports.findByName = function (name) {
  return Shows.findOne({ name: new RegExp("^" + escapeRegex(name.trim()) + "$", "i") });
};

// findByDate(date) - shows on a date, sorted by name.
exports.findByDate = function (date) {
  return Shows.find({ date: date.trim() }).sort({ name: 1 });
};

// escapeRegex(text) - makes user text safe to put inside a regular expression.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
