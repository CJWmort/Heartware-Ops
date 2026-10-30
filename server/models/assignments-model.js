// The Assignment database model (volunteer, show, school, status, deadline, journey stages) and its
// query helpers.

const mongoose = require("mongoose");
const Schools = require("./schools-model");
const Account = require("./account-model");
const CONFIRMED_STATUS = "Accepted";
const VOLUNTEER_FIELDS = "name phone email postalCode address lat lng";

const MAX_STAGE = 8;

const PENDING_HOURS = 24;
// pendingDeadline() - returns "now + 24 hours" as a Date. Used as the answer-by time of a Pending
// offer (new Date(now) + PENDING_HOURS converted to milliseconds).
const pendingDeadline = () => new Date(Date.now() + PENDING_HOURS * 60 * 60 * 1000);

// todaySG() - today's date in Singapore as "YYYY-MM-DD" (the "en-CA" locale prints dates in that
// order). Journey stages reset at Singapore midnight because a stage saved on an earlier date is
// simply read as 0.
function todaySG() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

const AssignmentsSchema = new mongoose.Schema({
  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
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
  show: {
    type: String,
    required: true,
    trim: true,
    enum: {
      values: ["NE Show 1", "NE Show 2", "NE Show 3", "NE Show 4"],
      message: "Show must be NE Show 1, NE Show 2, NE Show 3 or NE Show 4",
    },
  },
  distance: {
    type: Number,
    min: [0, "Distance cannot be negative"],
  },
  status: {
    type: String,
    required: true,
    enum: {
      values: ["Pending", "Accepted", "Declined", "Withdrawn", "Reserve"],
      message: "Status must be Pending, Accepted, Declined, Withdrawn or Reserve",
    },
    default: "Pending",
  },
  published: {
    type: Boolean,
    default: false,
  },
  expiresAt: {
    type: Date,
  },
  withdrawReason: {
    type: String,
    trim: true,
    maxlength: [300, "Reason must be 300 characters or fewer"],
  },
  stage: {
    type: Number,
    min: 0,
    max: MAX_STAGE,
    default: 0,
  },
  stageDate: {
    type: String,
  },
  stageHistory: {
    type: [
      {
        stage: { type: Number, min: 1, max: MAX_STAGE },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    default: [],
  },
  fromReserve: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

AssignmentsSchema.index({ volunteer: 1, show: 1 }, { unique: true });
AssignmentsSchema.index({ school: 1 });

const Assignments = mongoose.model("Assignments", AssignmentsSchema, "assignments");

// deleteAll(show) - 1) a show given -> delete only that show's rows 2) no show -> delete every
// assignment.
exports.deleteAll = function (show = null) {
  return Assignments.deleteMany(show ? { show } : {});
};

// findKept() - rows that must survive a re-run (Accepted / Declined / Withdrawn). 1) find them 2)
// fetch only volunteer, school, show, status 3) .lean() = plain objects (faster; never saved back).
exports.findKept = function () {
  return Assignments.find({ status: { $in: [CONFIRMED_STATUS, "Declined", "Withdrawn"] } })
    .select("volunteer school show status")
    .lean();
};

// deleteReplaceable(shows) - 1) delete the Pending and Reserve rows 2) only inside the given shows, so
// running one show never touches another.
exports.deleteReplaceable = function (shows) {
  return Assignments.deleteMany({ status: { $in: ["Pending", "Reserve"] }, show: { $in: shows } });
};

// publishedShows() - 1) list each show name once ("distinct") that has at least one published row. Run
// Allocations skips these shows.
exports.publishedShows = function () {
  return Assignments.distinct("show", { published: true });
};

// validateMany(assignments) - checks records against the schema WITHOUT saving them. 1) for each
// record build a throw-away Assignments object 2) validateSync() returns an error or nothing 3)
// collect the messages 4) return the list (empty = all fine).
exports.validateMany = function (assignments) {
  const problems = [];
  for (const record of assignments) {
    const error = new Assignments(record).validateSync();
    if (error)
      problems.push(
        Object.values(error.errors)
          .map((e) => e.message)
          .join("; "),
      );
  }
  return problems;
};

// createMany(assignments) - saves many records in one call (insertMany).
exports.createMany = function (assignments) {
  return Assignments.insertMany(assignments);
};

// retrieveAll() - 1) all assignments 2) fill in the school document 3) fill in the volunteer (limited
// fields, no password hash) 4) newest first.
exports.retrieveAll = function () {
  return Assignments.find()
    .populate("school")
    .populate("volunteer", VOLUNTEER_FIELDS)
    .sort({ _id: -1 });
};

// findByVolunteer(volunteerId) - same as retrieveAll but only this volunteer's rows, sorted by show
// name.
exports.findByVolunteer = function (volunteerId) {
  return Assignments.find({ volunteer: volunteerId })
    .populate("school")
    .populate("volunteer", VOLUNTEER_FIELDS)
    .sort({ show: 1 });
};

// findBySchool(schoolId) - rows for one school, oldest first, with school and volunteer filled in.
exports.findBySchool = function (schoolId) {
  return Assignments.find({ school: schoolId })
    .populate("school")
    .populate("volunteer", VOLUNTEER_FIELDS)
    .sort({ _id: 1 });
};

// findByShow(show) - rows for one show (name trimmed), with school and volunteer filled in.
exports.findByShow = function (show) {
  return Assignments.find({ show: show.trim() })
    .populate("school")
    .populate("volunteer", VOLUNTEER_FIELDS)
    .sort({ show: 1 });
};

// hasConfirmed(volunteerId) - true if the volunteer has at least one Accepted row (any show). exists()
// stops at the first match, then !! turns the answer into true/false.
exports.hasConfirmed = async function (volunteerId) {
  return !!(await Assignments.exists({ volunteer: volunteerId, status: CONFIRMED_STATUS }));
};

// findMine(volunteerId) - the volunteer's own PUBLISHED rows with the school filled in. The volunteer
// field is not populated, so no account data is sent back.
exports.findMine = function (volunteerId) {
  return Assignments.find({ volunteer: volunteerId, published: true })
    .populate("school")
    .sort({ show: 1 });
};

// acceptMine(assignmentId, volunteerId) - 1) find a row that is this id, belongs to this volunteer, is
// Pending and is published 2) set status to Accepted and return the new version 3) no match -> null.
exports.acceptMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndUpdate(
    { _id: assignmentId, volunteer: volunteerId, status: "Pending", published: true },
    { status: "Accepted" },
    { new: true, runValidators: true },
  ).populate("school");
};

// declineMine(assignmentId, volunteerId) - 1) same match rule as accept 2) DELETE the row and return
// it (the controller logs it as Declined) 3) no match -> null.
exports.declineMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndDelete(
    { _id: assignmentId, volunteer: volunteerId, status: "Pending", published: true },
  ).populate("school");
};

// withdrawMine(assignmentId, volunteerId) - 1) match: this id, this volunteer, status Accepted 2)
// delete and return the row 3) no match -> null.
exports.withdrawMine = function (assignmentId, volunteerId) {
  return Assignments.findOneAndDelete({
    _id: assignmentId,
    volunteer: volunteerId,
    status: "Accepted",
  }).populate("school");
};

// restore(assignment) - re-creates a row that was just deleted (used if logging the decline/withdrawal
// failed).
exports.restore = function (assignment) {
  return Assignments.create(assignment);
};

// acceptedShowsAmong(volunteerId, shows) - 1) find this volunteer's Accepted rows among the given
// shows 2) return just the show names, e.g. ["NE Show 2"].
exports.acceptedShowsAmong = async function (volunteerId, shows) {
  const rows = await Assignments.find({
    volunteer: volunteerId,
    show: { $in: shows },
    status: CONFIRMED_STATUS,
  }).select("show");
  return rows.map((r) => r.show);
};

// deleteOpenForShows(volunteerId, shows) - deletes the volunteer's Pending and Reserve rows in those
// shows (frees school places). Declined/Withdrawn rows stay as history.
exports.deleteOpenForShows = function (volunteerId, shows) {
  return Assignments.deleteMany({
    volunteer: volunteerId,
    show: { $in: shows },
    status: { $in: ["Pending", "Reserve"] },
  });
};

// addToReserve(volunteerId, name, shows, publishedShows) - for each show: 1) updateOne with upsert 2)
// $setOnInsert only writes if no row exists yet (an existing row is left untouched) 3) new row =
// status Reserve, no school, published only if that show is already published 4) Promise.all waits for
// all shows.
exports.addToReserve = function (volunteerId, name, shows, publishedShows = []) {
  return Promise.all(
    shows.map((show) =>
      Assignments.updateOne(
        { volunteer: volunteerId, show },
        {
          $setOnInsert: {
            volunteer: volunteerId,
            name,
            show,
            status: "Reserve",
            school: null,
            published: publishedShows.includes(show),
          },
        },
        { upsert: true }
      )
    )
  );
};

// publish(show) - releases drafts to volunteers. 1) filter = rows not yet published (optionally one
// show) 2) Pending rows get published = true AND a 24-hour expiresAt 3) all other statuses just get
// published = true 4) return the combined modified count.
exports.publish = async function (show) {
  const filter = { published: { $ne: true } };
  if (show) filter.show = show;
  const pending = await Assignments.updateMany(
    { ...filter, status: "Pending" },
    { $set: { published: true, expiresAt: pendingDeadline() } },
  );
  const rest = await Assignments.updateMany(filter, { $set: { published: true } });
  return { modifiedCount: pending.modifiedCount + rest.modifiedCount };
};

// findOverduePending() - ids of Pending, published rows whose expiresAt is in the past.
exports.findOverduePending = function () {
  return Assignments.find({ status: "Pending", published: true, expiresAt: { $lt: new Date() } }).select("_id");
};

// deleteIfOverdue(rowId) - 1) delete the row only if it is STILL Pending and STILL overdue 2) if the
// volunteer accepted at the same moment, nothing matches and null is returned (accept wins) 3) return
// the deleted row with its school.
exports.deleteIfOverdue = function (rowId) {
  return Assignments.findOneAndDelete({
    _id: rowId,
    status: "Pending",
    expiresAt: { $lt: new Date() },
  }).populate("school");
};

// countDrafts(show) - number of unpublished rows (optionally one show), used for the "N unpublished"
// label.
exports.countDrafts = function (show) {
  const filter = { published: { $ne: true } };
  if (show) filter.show = show;
  return Assignments.countDocuments(filter);
};

// effectiveStage(doc) - the stage that counts today: the saved stage if stageDate is today
// (Singapore), otherwise 0.
function effectiveStage(doc) {
  return doc.stageDate === todaySG() ? doc.stage || 0 : 0;
}

// withToday(doc) - 1) convert the Mongoose document to a plain object 2) if its stageDate is today
// keep stage and stageHistory 3) otherwise report stage 0 and an empty history.
exports.withToday = function (doc) {
  const o = doc.toObject();
  const fresh = o.stageDate === todaySG();
  o.stage = fresh ? o.stage || 0 : 0;
  o.stageHistory = fresh ? o.stageHistory || [] : [];
  return o;
};

// advanceStage(volunteerId, show, expected) - moves to the next checkpoint safely. 1. Find the
// volunteer's ACCEPTED row for the show; none -> { problem: "none" }. 2. current = today's stage. The
// request must be exactly current + 1 and not above 8, else { problem: "conflict", stage: current }.
// 3. From stage 0: start a fresh history (the update re-checks the stage is still 0). 4. Otherwise:
// set the new stage and push a history entry, but only if the stored stage still equals what we read
// (two taps at once cannot both win). 5. Update matched nothing -> conflict with the real stage.
// Success -> { assignment }.
exports.advanceStage = async function (volunteerId, show, expected) {
  const filter = { volunteer: volunteerId, show, status: CONFIRMED_STATUS };
  const row = await Assignments.findOne(filter);
  if (!row) return { problem: "none" };

  const current = effectiveStage(row);
  if (expected !== current + 1 || expected > MAX_STAGE)
    return { problem: "conflict", stage: current };

  const today = todaySG();
  const entry = { stage: expected, at: new Date() };
  let updated;
  if (current === 0) {
    updated = await Assignments.findOneAndUpdate(
      { _id: row._id, $or: [{ stageDate: { $ne: today } }, { stage: 0 }] },
      { $set: { stage: 1, stageDate: today, stageHistory: [entry] } },
      { new: true },
    );
  } else {
    updated = await Assignments.findOneAndUpdate(
      { _id: row._id, stageDate: today, stage: current },
      { $set: { stage: expected }, $push: { stageHistory: entry } },
      { new: true },
    );
  }
  if (!updated)
    return {
      problem: "conflict",
      stage: effectiveStage((await Assignments.findById(row._id)) || row),
    };
  return { assignment: updated };
};

// undoStage(volunteerId, show, from) - removes the last checkpoint. 1) find the accepted row (none ->
// "none") 2) there must be a stage to undo and `from` must equal the current stage (else conflict, so
// a double tap cannot undo two) 3) lower the stage by 1 and $pop the newest history entry, only if the
// stage is unchanged 4) return { assignment } or conflict.
exports.undoStage = async function (volunteerId, show, from) {
  const filter = { volunteer: volunteerId, show, status: CONFIRMED_STATUS };
  const row = await Assignments.findOne(filter);
  if (!row) return { problem: "none" };

  const current = effectiveStage(row);
  if (current === 0 || from !== current) return { problem: "conflict", stage: current };

  const updated = await Assignments.findOneAndUpdate(
    { _id: row._id, stageDate: todaySG(), stage: current },
    { $set: { stage: current - 1 }, $pop: { stageHistory: 1 } },
    { new: true },
  );
  if (!updated)
    return {
      problem: "conflict",
      stage: effectiveStage((await Assignments.findById(row._id)) || row),
    };
  return { assignment: updated };
};

exports.MAX_STAGE = MAX_STAGE;
exports.PENDING_HOURS = PENDING_HOURS;

// findFullRoute(show) - Full Route badge: accepted volunteers who reached stage 8 (all checkpoints).
// Returns just the volunteer ids.
exports.findFullRoute = function (show) {
  return Assignments.find({ show: show, status: CONFIRMED_STATUS, stage: MAX_STAGE }).select(
    "volunteer",
  );
};

// findArrivals(show) - Early Bird badge: accepted volunteers with at least one checkpoint, including
// their stageHistory and the school's reportingTime (to compare arrival with the deadline).
exports.findArrivals = function (show) {
  return Assignments.find({ show: show, status: CONFIRMED_STATUS, stage: { $gte: 1 } })
    .select("volunteer school stageHistory")
    .populate("school", "reportingTime");
};

// findSuperSubs(show) - Super Sub badge: accepted volunteers who were filled in from the reserve list
// (fromReserve) and have started the journey.
exports.findSuperSubs = function (show) {
  return Assignments.find({
    show: show,
    status: CONFIRMED_STATUS,
    fromReserve: true,
    stage: { $gte: 1 },
  })
    .select("volunteer school stageHistory")
    .populate("school", "reportingTime");
};

exports.SHOWS = AssignmentsSchema.path("show").enumValues;

// findBoard(show) - data for the HQ Live Board. An aggregation pipeline, step by step: 1. $match: this
// show's ACCEPTED assignments. 2. $lookup accounts -> the volunteer's name ($unwind = one account per
// row). 3. $lookup schools -> the allocated school (kept even if the school is missing). 4. $lookup
// locations -> the latest GPS point (kept even if the volunteer never reported). 5. $project: choose
// the output fields; stage/stageHistory only count if stageDate is today, else 0 / []. 6. $sort by
// name.
exports.findBoard = function (show) {
  const today = todaySG();
  return Assignments.aggregate([
    { $match: { show: show.trim(), status: CONFIRMED_STATUS } },
    { $lookup: { from: "accounts", localField: "volunteer", foreignField: "_id", as: "account" } },
    { $unwind: "$account" },
    { $lookup: { from: "schools", localField: "school", foreignField: "_id", as: "sch" } },
    { $unwind: { path: "$sch", preserveNullAndEmptyArrays: true } },
    {
      $lookup: { from: "locations", localField: "volunteer", foreignField: "volunteer", as: "loc" },
    },
    { $unwind: { path: "$loc", preserveNullAndEmptyArrays: true } },
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
        stageHistory: {
          $cond: [{ $eq: ["$stageDate", today] }, { $ifNull: ["$stageHistory", []] }, []],
        },
      },
    },
    { $sort: { name: 1 } },
  ]);
};

// volunteerIdsWithRow(show) - each volunteer id once who already has ANY row
// (Pending/Accepted/Reserve/...) in the show; used to spot late sign-ups.
exports.volunteerIdsWithRow = function (show) {
  return Assignments.distinct("volunteer", { show });
};

// findOpenPlaces(show) - schools in the show that still have free places. 1. Load the show's schools.
// 2. Count Pending + Accepted rows per school (these hold a place). 3. open = p5Classes - held; keep
// schools with open > 0 and return [{ school, open }]. Computed on demand, never stored.
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

// findReserves(show) - the show's reserve list as { rowId, name, lat, lng }. 1) load Reserve rows with
// the volunteer's name/location 2) skip people with no coordinates 3) skip anyone who
// declined/withdrew from this show before.
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

// fillFromReserve(rowId, schoolId, distanceKm) - moves one reserve person into an open place. 1.
// Update their row ONLY if it is still Reserve: set school, status Pending, published, distance,
// fromReserve and a fresh 24-hour deadline. 2. Nothing matched (someone else took them) -> { problem:
// "taken" }. 3. Re-count who holds that school; if the school is now over capacity (two fills at the
// same moment) put the row back to Reserve and return { problem: "full" }. 4. Otherwise { assignment
// }.
exports.fillFromReserve = async function (rowId, schoolId, distanceKm) {
  const row = await Assignments.findOneAndUpdate(
    { _id: rowId, status: "Reserve" },
    {
      $set: {
        school: schoolId,
        status: "Pending",
        published: true,
        distance: distanceKm,
        fromReserve: true,
        expiresAt: pendingDeadline(),
      },
    },
    { new: true, runValidators: true },
  );
  if (!row) return { problem: "taken" };

  const school = (await Schools.findByShow(row.show).lean()).find(
    (s) => String(s._id) === String(schoolId),
  );
  const holding = await Assignments.countDocuments({
    show: row.show,
    school: schoolId,
    status: { $in: ["Pending", CONFIRMED_STATUS] },
  });
  if (!school || holding > school.p5Classes) {
    await Assignments.updateOne(
      { _id: row._id },
      { $set: { status: "Reserve", school: null, distance: null, fromReserve: false } },
    );
    return { problem: "full" };
  }
  return { assignment: row };
};
