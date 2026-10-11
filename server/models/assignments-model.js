const mongoose = require("mongoose");
const Schools = require('./schools-model');
const Account = require('./account-model');

// Create a new 'assignment' schema
// One document = one volunteer tagged to one school for one show
const AssignmentsSchema = new mongoose.Schema({
  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account", // change to match your volunteers model name
    required: true,
  },
  school: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Schools",
    required: true,
  },
  // same value as the school's show (e.g. 'NE Show 1'); kept here so that
  // the unique index below can enforce one school per volunteer per show
  show: {
    type: String,
    required: true,
    trim: true,
    enum: {
      values: ["NE Show 1", "NE Show 2", "NE Show 3", "NE Show 4"],
      message: "Show must be NE Show 1, NE Show 2, NE Show 3 or NE Show 4",
    },
  },
  // straight-line distance in km from the volunteer's home to the school,
  // worked out by the scarcity-first matching
  distance: {
    type: Number,
    min: [0, "Distance cannot be negative"],
  },
  status: {
    type: String,
    required: true,
    enum: {
      values: ["Pending", "Accepted", "Declined"],
      message: "Status must be pending, accecpted or declined",
    },
    default: "Pending",
  },
});

// A volunteer can only have one assignment (one school) per show
AssignmentsSchema.index({ volunteer: 1, show: 1 }, { unique: true });
// Fast look-up of a school's volunteers
AssignmentsSchema.index({ school: 1 });

// 'assignment' refer to the 'assignments' collection in our database
const Assignments = mongoose.model("Assignments", AssignmentsSchema, "assignments");


// ===== DELETE =====

// Remove every assignment. Run this before createMany() when re-running the
// allocation, otherwise the unique (volunteer, show) index rejects the new ones.
exports.deleteAll = function () {
  return Assignments.deleteMany({});
};


// ===== CREATE =====

// Save many assignments at once, e.g. the result of scarcityFirst():
//   [{ volunteer, school, show, distance }, ...]
exports.createMany = function (assignments) {
  return Assignments.insertMany(assignments);
};


// ===== READ =====

// Fetch all assignments, newest first
exports.retrieveAll = function () {
  return Assignments.find().populate("school").populate("volunteer").sort({ _id: -1 });
};

// Fetch all assignments of a volunteer (across shows)
exports.findByVolunteer = function (volunteerId) {
  return Assignments.find({ volunteer: volunteerId }).populate("school").populate("volunteer").sort({ show: 1 });
};

// Fetch all assignments of a school, optionally only one status
exports.findBySchool = function (schoolId) {
  return Assignments.find({ school: schoolId }).populate("school").populate("volunteer").sort({ _id: 1 });
};

// Fetch all assignments in a show (e.g. 'NE Show 1')
exports.findByShow = function (show) {
  return Assignments.find({ show: show.trim() }).populate("school").populate("volunteer").sort({ show: 1 });
};
