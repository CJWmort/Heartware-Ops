const mongoose = require("mongoose");
const Schools = require('./schools-model');
const Account = require('./account-model');
const CONFIRMED_STATUS = "Accepted"; // The status that counts as volunteer accepted the allocation
// FIX (security): .populate("volunteer") used to copy the WHOLE account into the response, including the
// password hash. We now list only the fields the admin board needs (lat/lng are for the map).
const VOLUNTEER_FIELDS = "name phone email postalCode address lat lng";

// ===== JOURNEY STAGES (what the volunteer is up to on the day) =====
// 0 = nothing clocked yet, 1..8 = the checkpoints (the names live in client/src/utils/constants.js, JOURNEY_STAGES).
// Each assignment (= one volunteer in one NE Show) has its own run, because the shows are on different dates.
const MAX_STAGE = 8;

// Today's date in Singapore as "YYYY-MM-DD". Stages reset at midnight Singapore time: a stage saved on an earlier
// day is simply read as 0 (see effectiveStage), so no scheduled job is needed.
function todaySG() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

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
      // FIX: "Withdrawn" was missing, so withdrawMine() failed validation and the server answered 500.
      values: ["Pending", "Accepted", "Declined", "Withdrawn", "Reserve"],
      message: "Status must be Pending, Accepted, Declined, Withdrawn or Reserve",
    },
    default: "Pending",
  },
  // NEW (publish step): a new allocation starts as a DRAFT that only the admin can see.
  // Volunteers see (and can accept/decline) a row only after the admin presses "Publish".
  // Rows saved before this field existed have no value, so they stay hidden until published once.
  published: {
    type: Boolean,
    default: false,
  },
  // why the volunteer declined or pulled out (only set when status is 'Declined' or 'Withdrawn')
  withdrawReason: {
    type: String,
    trim: true,
    maxlength: [300, "Reason must be 300 characters or fewer"],
  },
  // Journey stage for the day (0 = not started, 1-8 = last checkpoint clocked) and the day it belongs to.
  // stageHistory has one entry per checkpoint reached today, so the admin can see when each was clocked.
  stage: {
    type: Number,
    min: 0,
    max: MAX_STAGE,
    default: 0,
  },
  stageDate: {
    type: String, // "YYYY-MM-DD" in Singapore time
  },
  stageHistory: {
    type: [{ stage: { type: Number, min: 1, max: MAX_STAGE }, at: { type: Date, default: Date.now }, _id: false }],
    default: [],
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
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


// NEW (re-run safety): assignments that must SURVIVE a re-run, because the volunteer already gave a
// final answer (Accepted, Declined or Withdrawn). The controller keeps these and only fills what is left.
exports.findKept = function () {
  return Assignments.find({ status: { $in: [CONFIRMED_STATUS, "Declined", "Withdrawn"] } })
    .select("volunteer school show status") // only what the run needs
    .lean(); // plain objects: faster, and we never save them back
};

// NEW (re-run safety): delete ONLY what a re-run recalculates (Pending and Reserve).
// Accepted / Declined / Withdrawn rows are left alone, so nobody who accepted is ever re-assigned.
// excludeShows: published shows are locked (see publishedShows), so a re-run never deletes their rows
exports.deleteReplaceable = function (excludeShows = []) {
  return Assignments.deleteMany({ status: { $in: ["Pending", "Reserve"] }, show: { $nin: excludeShows } });
};

// Shows that have at least one published row. Run Allocations skips these: re-running would delete the
// automatic replacements (they are Pending) and rebuild the reserve list after volunteers have seen their school.
exports.publishedShows = function () {
  return Assignments.distinct("show", { published: true });
};


// ===== CREATE =====

// Check records against the schema WITHOUT saving them. Returns a list of problems (empty = all fine).
// The controller calls this before deleteAll(), so a bad record can never leave the table empty.
exports.validateMany = function (assignments) {
  const problems = [];
  for (const record of assignments) {
    const error = new Assignments(record).validateSync();
    if (error) problems.push(Object.values(error.errors).map((e) => e.message).join("; "));
  }
  return problems;
};

// Save many assignments at once, e.g. the result of scarcityFirst():
//   [{ volunteer, school, show, distance }, ...]
exports.createMany = function (assignments) {
  return Assignments.insertMany(assignments);
};


// ===== READ =====

// Fetch all assignments, newest first
exports.retrieveAll = function () {
  return Assignments.find().populate("school").populate("volunteer", VOLUNTEER_FIELDS).sort({ _id: -1 }); // volunteer limited: no password hash
};

// Fetch all assignments of a volunteer (across shows)
exports.findByVolunteer = function (volunteerId) {
  return Assignments.find({ volunteer: volunteerId }).populate("school").populate("volunteer", VOLUNTEER_FIELDS).sort({ show: 1 }); // volunteer limited: no password hash
};

// Fetch all assignments of a school, optionally only one status
exports.findBySchool = function (schoolId) {
  return Assignments.find({ school: schoolId }).populate("school").populate("volunteer", VOLUNTEER_FIELDS).sort({ _id: 1 }); // volunteer limited: no password hash
};

// Fetch all assignments in a show (e.g. 'NE Show 1')
exports.findByShow = function (show) {
  return Assignments.find({ show: show.trim() }).populate("school").populate("volunteer", VOLUNTEER_FIELDS).sort({ show: 1 }); // volunteer limited: no password hash
};

// True if the volunteer has at least one "Accepted" assignment (any show) - Jun Wen
exports.hasConfirmed = async function (volunteerId) {
  return !!(await Assignments.exists({ volunteer: volunteerId, status: CONFIRMED_STATUS }));
};

// Fetch the logged in volunteer's own assignments, with the school filled in.
// Volunteer is not populated so the account (and password hash) is never sent back.
exports.findMine = function (volunteerId) {
  // published: true -> a volunteer never sees a draft allocation the admin has not released yet
  return Assignments.find({ volunteer: volunteerId, published: true }).populate("school").sort({ show: 1 });
};


// ===== UPDATE =====

// Volunteer accepts their own pending assignment.
// Only matches if the assignment belongs to this volunteer and is still 'Pending',
// so returns null otherwise.
exports.acceptMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndUpdate(
    // published: true -> cannot accept a draft (e.g. from a stale page or a hand-made request)
    { _id: assignmentId, volunteer: volunteerId, status: "Pending", published: true },
    { status: "Accepted" },
    { new: true, runValidators: true } // return the updated doc
  ).populate("school");
};

// Volunteer declines an assignment they have not accepted yet: the row is DELETED and returned
// (the controller logs it in the volunteer's withdrawnShows). Only matches if it belongs to this
// volunteer, is still 'Pending' and is published, so returns null otherwise.
exports.declineMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndDelete(
    // published: true -> same reason as accept: only a released assignment can be answered
    { _id: assignmentId, volunteer: volunteerId, status: "Pending", published: true }
  ).populate("school");
};

// Volunteer withdraws from a show they had already accepted: the row is DELETED and returned.
// Only matches if it belongs to this volunteer and is 'Accepted', so returns null otherwise.
exports.withdrawMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndDelete(
    { _id: assignmentId, volunteer: volunteerId, status: "Accepted" }
  ).populate("school");
};

// Put back a row that was just deleted (used if logging the decline / withdrawal failed)
exports.restore = function (assignment) {
  return Assignments.create(assignment);
};


// NEW (availability change): which of these shows has this volunteer ALREADY ACCEPTED? Returns e.g. ["NE Show 2"].
// Used to block the volunteer from unticking a show they are committed to.
exports.acceptedShowsAmong = async function (volunteerId, shows) {
  const rows = await Assignments.find({ volunteer: volunteerId, show: { $in: shows }, status: CONFIRMED_STATUS }).select("show");
  return rows.map((r) => r.show);
};

// NEW (availability change): the volunteer is no longer available for these shows, so drop the places that were
// waiting for an answer (Pending) or on the reserve list. That frees the school place for the next allocation run.
// Declined / Withdrawn rows are kept on purpose: they are the history of what the volunteer answered.
exports.deleteOpenForShows = function (volunteerId, shows) {
  return Assignments.deleteMany({ volunteer: volunteerId, show: { $in: shows }, status: { $in: ["Pending", "Reserve"] } });
};

// NEW (publish step): release the draft to volunteers. show = "NE Show 1" publishes that show only,
// null publishes every show. $ne: true also catches old rows that have no "published" field at all.
exports.publish = function (show) {
  const filter = { published: { $ne: true } };
  if (show) filter.show = show;
  return Assignments.updateMany(filter, { $set: { published: true } });
};

// How many rows of a show (or all shows) are still drafts - lets the board show "N unpublished".
exports.countDrafts = function (show) {
  const filter = { published: { $ne: true } };
  if (show) filter.show = show;
  return Assignments.countDocuments(filter);
};


// ===== JOURNEY STAGES =====

// The stage that counts today: a stage saved on an earlier day is read as 0
function effectiveStage(doc) {
  return doc.stageDate === todaySG() ? doc.stage || 0 : 0;
}

// An assignment as a plain object whose stage / stageHistory only reflect TODAY (what the volunteer page needs)
exports.withToday = function (doc) {
  const o = doc.toObject();
  const fresh = o.stageDate === todaySG();
  o.stage = fresh ? o.stage || 0 : 0;
  o.stageHistory = fresh ? o.stageHistory || [] : [];
  return o;
};

// Volunteer clocks the next checkpoint. `expected` is the stage they believe they are moving TO.
// Returns { assignment } on success, { problem: "none" } if they have no accepted assignment for that show, or
// { problem: "conflict", stage } if their stage is not what the page thought (double tap, second phone, new day).
exports.advanceStage = async function (volunteerId, show, expected) {
  const filter = { volunteer: volunteerId, show, status: CONFIRMED_STATUS };
  const row = await Assignments.findOne(filter);
  if (!row) return { problem: "none" };

  const current = effectiveStage(row);
  if (expected !== current + 1 || expected > MAX_STAGE) return { problem: "conflict", stage: current };

  const today = todaySG();
  const entry = { stage: expected, at: new Date() };
  let updated;
  if (current === 0) {
    // First checkpoint of the day: start a fresh history. The filter re-checks that it is still 0 today.
    updated = await Assignments.findOneAndUpdate(
      { _id: row._id, $or: [{ stageDate: { $ne: today } }, { stage: 0 }] },
      { $set: { stage: 1, stageDate: today, stageHistory: [entry] } },
      { new: true }
    );
  } else {
    // The filter pins the stage we just read, so two taps at the same moment cannot both succeed
    updated = await Assignments.findOneAndUpdate(
      { _id: row._id, stageDate: today, stage: current },
      { $set: { stage: expected }, $push: { stageHistory: entry } },
      { new: true }
    );
  }
  if (!updated) return { problem: "conflict", stage: effectiveStage((await Assignments.findById(row._id)) || row) };
  return { assignment: updated };
};

// Volunteer undoes the last checkpoint (as many times as they like, down to 0). `from` is the stage they are
// leaving, so a double tap cannot undo two. Same return values as advanceStage.
exports.undoStage = async function (volunteerId, show, from) {
  const filter = { volunteer: volunteerId, show, status: CONFIRMED_STATUS };
  const row = await Assignments.findOne(filter);
  if (!row) return { problem: "none" };

  const current = effectiveStage(row);
  if (current === 0 || from !== current) return { problem: "conflict", stage: current };

  const updated = await Assignments.findOneAndUpdate(
    { _id: row._id, stageDate: todaySG(), stage: current },
    { $set: { stage: current - 1 }, $pop: { stageHistory: 1 } },
    { new: true }
  );
  if (!updated) return { problem: "conflict", stage: effectiveStage((await Assignments.findById(row._id)) || row) };
  return { assignment: updated };
};

exports.MAX_STAGE = MAX_STAGE;


// ===== LIVE BOARD ===== - Jun Wen

// The list of valid shows, taken from the schema's enum (fills the admin's dropdown)
exports.SHOWS = AssignmentsSchema.path("show").enumValues;

// Confirmed volunteers of a show, each with their name, allocated school and
// latest location (if any). Volunteers who haven't reported yet are included,
// with no lat/lng/updatedAt.
exports.findBoard = function (show) {
  const today = todaySG(); // stage / history only count if they were saved today
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
        stage: { $cond: [{ $eq: ["$stageDate", today] }, { $ifNull: ["$stage", 0] }, 0] },
        stageHistory: { $cond: [{ $eq: ["$stageDate", today] }, { $ifNull: ["$stageHistory", []] }, []] },
      },
    },
    { $sort: { name: 1 } },
  ]);
}


// ===== AUTOMATIC REPLACEMENTS (used by utils/reserve-replacement.js) =====

// Schools of a show that still have an open place. A place is held by a Pending or Accepted row; a volunteer
// who declined or withdrew has no row any more, so their place counts as open. Worked out on demand, never stored.
// Returns [{ school, open }] for schools with open > 0.
exports.findOpenPlaces = async function (show) {
  const schools = await Schools.findByShow(show).lean();
  const holding = await Assignments.aggregate([
    { $match: { show, status: { $in: ["Pending", CONFIRMED_STATUS] }, school: { $ne: null } } },
    { $group: { _id: "$school", count: { $sum: 1 } } },
  ]);
  const held = {};
  for (const h of holding) held[String(h._id)] = h.count;

  const places = [];
  for (const school of schools) {
    const open = school.p5Classes - (held[String(school._id)] || 0);
    if (open > 0) places.push({ school, open });
  }
  return places;
};

// The show's reserve list as plain objects { rowId, name, lat, lng }: Reserve rows with the volunteer's location.
// Skips anyone who declined / withdrew from this show (withdrawnShows) or has no location.
exports.findReserves = async function (show) {
  const rows = await Assignments.find({ show, status: "Reserve" })
    .populate("volunteer", "name lat lng withdrawnShows")
    .lean();
  const reserves = [];
  for (const row of rows) {
    const v = row.volunteer;
    if (!v || typeof v.lat !== "number" || typeof v.lng !== "number") continue;
    if ((v.withdrawnShows || []).some((w) => w.show === show)) continue;
    reserves.push({ rowId: row._id, name: v.name, lat: v.lat, lng: v.lng });
  }
  return reserves;
};

// Move one reserve into an open place: their Reserve row becomes Pending + published at that school.
// The filter re-checks status "Reserve", so if two fills pick the same person at once only one succeeds
// (the other gets { problem: "taken" } and tries the next person). After saving, the school is re-counted:
// if it is now over capacity (two fills for the last place at once) the row goes back to Reserve.
exports.fillFromReserve = async function (rowId, schoolId, distanceKm) {
  const row = await Assignments.findOneAndUpdate(
    { _id: rowId, status: "Reserve" },
    { $set: { school: schoolId, status: "Pending", published: true, distance: distanceKm } },
    { new: true, runValidators: true }
  );
  if (!row) return { problem: "taken" };

  const school = (await Schools.findByShow(row.show).lean()).find((s) => String(s._id) === String(schoolId));
  const holding = await Assignments.countDocuments({ show: row.show, school: schoolId, status: { $in: ["Pending", CONFIRMED_STATUS] } });
  if (!school || holding > school.p5Classes) {
    await Assignments.updateOne({ _id: row._id }, { $set: { status: "Reserve", school: null, distance: null } });
    return { problem: "full" };
  }
  return { assignment: row };
};
