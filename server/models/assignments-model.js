const mongoose = require("mongoose");
const Schools = require('./schools-model');
const Account = require('./account-model');
const CONFIRMED_STATUS = "Accepted"; // The status that counts as volunteer accepted the allocation

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
  },
  name: {
    type: String,
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
      values: ["Pending", "Accepted", "Declined", "Reserve"],
      message: "Status must be Pending, Accepted, Declined or Reserve",
    },
    default: "Pending",
  },
  // why the volunteer pulled out after accepting (only set when status is 'Withdrawn')
  withdrawReason: {
    type: String,
    trim: true,
    maxlength: [300, "Reason must be 300 characters or fewer"],
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

// True if the volunteer has at least one "Accepted" assignment (any show) - Jun Wen
exports.hasConfirmed = async function (volunteerId) {
  return !!(await Assignments.exists({ volunteer: volunteerId, status: CONFIRMED_STATUS }));
};


// ===== LIVE BOARD ===== - Jun Wen

// The list of valid shows, taken from the schema's enum (fills the admin's dropdown)
exports.SHOWS = AssignmentsSchema.path("show").enumValues;

// Confirmed volunteers of a show, each with their name, allocated school and
// latest location (if any). Volunteers who haven't reported yet are included,
// with no lat/lng/updatedAt.
exports.findBoard = function (show) {
  return Assignments.aggregate([
    { $match: { show: show.trim(), status: CONFIRMED_STATUS } },
    { $lookup: { from: "accounts", localField: "volunteer", foreignField: "_id", as: "account" } },
    { $unwind: "$account" },
    { $lookup: { from: "schools", localField: "school", foreignField: "_id", as: "sch" } },
    { $unwind: { path: "$sch", preserveNullAndEmptyArrays: true } }, // keep the volunteer even if the school is missing
    { $lookup: { from: "locations", localField: "volunteer", foreignField: "volunteer", as: "loc" } },
    { $unwind: { path: "$loc", preserveNullAndEmptyArrays: true } }, // keep volunteers with no location
    {
      $project: {
        _id: 0,
        volunteerId: "$volunteer",
        name: "$account.name",
        school: {
          name: "$sch.name",
          lat: "$sch.lat",
          lng: "$sch.lng",
          p5Classes: "$sch.p5Classes",
        },
        lat: "$loc.lat",
        lng: "$loc.lng",
        accuracy: "$loc.accuracy",
        updatedAt: "$loc.updatedAt",
      },
    },
    { $sort: { name: 1 } },
  ]);
// Fetch the logged in volunteer's own assignments, with the school filled in.
// Volunteer is not populated so the account (and password hash) is never sent back.
exports.findMine = function (volunteerId) {
  return Assignments.find({ volunteer: volunteerId }).populate("school").sort({ show: 1 });
};


// ===== UPDATE =====

// Volunteer accepts their own pending assignment.
// Only matches if the assignment belongs to this volunteer and is still 'Pending',
// so returns null otherwise.
exports.acceptMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndUpdate(
    { _id: assignmentId, volunteer: volunteerId, status: "Pending" },
    { status: "Accepted" },
    { new: true, runValidators: true } // return the updated doc
  ).populate("school");
};

// Volunteer pulls out of a show they had already accepted.
// Only matches if the assignment belongs to this volunteer and is 'Accepted',
// so returns null otherwise.
exports.withdrawMine = function (assignmentId, volunteerId, reason) {
  return Assignments.findOneAndUpdate(
    { _id: assignmentId, volunteer: volunteerId, status: "Accepted" },
    { status: "Withdrawn", withdrawReason: reason },
    { new: true, runValidators: true } // return the updated doc
  ).populate("school");
};
