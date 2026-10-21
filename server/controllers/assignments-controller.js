const mongoose = require("mongoose");
const Assignments = require("../models/assignments-model");
const Account = require("../models/account-model");
const School = require("../models/schools-model");
const Shows = require("../models/shows-model");
const { fillOpenPlaces } = require("../utils/auto-fill");
const dotenv = require("dotenv");

const { scarcityFirst } = require("../utils/scarcityFirst");
const { greedyByPair } = require("../utils/greedy");

// dotenv.config({ path: "./config.env" }); //process.env.ONEMAP_TOKEN

// GET /api/assignments/
exports.getAssignments = async (req, res) => {
  try {
    const assignments = await Assignments.retrieveAll();
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/assignments/me -- the logged in volunteer's assignments
exports.getMyAssignments = async (req, res) => {
  try {
    const assignments = await Assignments.findMine(req.session.userId);
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/assignments/show/:show
exports.getShowAssignments = async (req, res) => {
  try {
    const show = req.params.show;
    const assignments = await Assignments.findByShow(show);
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/assignments/run -- assigns volunteers to schools (admin only)
// Safe to run again and again. Volunteers who already ACCEPTED keep their school, and anyone
// who DECLINED / WITHDREW is not given the same show again. Only the rest (Pending, Reserve and
// brand-new volunteers) are matched, to the places that are still open.
// Body { reset: true } wipes everything instead (including accepted) for a fresh start.
// The result is saved as a DRAFT (published = false); volunteers see it only after /publish.
exports.runAssignments = async (req, res) => {
  try {
    // Only a real boolean true resets; the string "true" does not, so a typo can't erase accepted volunteers
    const reset = req.body?.reset === true;
    // Rows that must survive this run (Accepted / Declined / Withdrawn); nothing is kept on a reset
    const kept = reset ? [] : await Assignments.findKept();
    // A published show is locked: re-running it would undo the automatic replacements and rebuild the reserve
    // list after volunteers have already seen their school. Reset ignores the lock.
    const skippedShows = reset ? [] : await Assignments.publishedShows();

    // Work out every show first, so a bad record stops the run BEFORE anything is deleted
    // (before: delete first, so one error halfway left the table empty)
    const results = [];
    // FIX: was `for (show of [...])` with no `const`, which created an accidental global variable.
    // Assignments.SHOWS comes from the model's enum, so the list of shows lives in one place instead of four.
    for (const show of Assignments.SHOWS) {
      if (skippedShows.includes(show)) continue;
      const keptInShow = kept.filter((a) => a.show === show);

      // Volunteers who already have a final answer for this show are left out of the matching,
      // otherwise they would get a second row for the same show (the database allows only one)
      const locked = new Set(keptInShow.map((a) => String(a.volunteer)));

      // Places already taken by accepted volunteers, per school (key = school id as text)
      const taken = {};
      for (const a of keptInShow) {
        if (a.status === "Accepted" && a.school) {
          taken[String(a.school)] = (taken[String(a.school)] || 0) + 1;
        }
      }

      const volunteers = (await Account.findVolunteersByShow(show)).filter(
        (v) => !locked.has(String(v._id)),
      );
      // Give the algorithm each school with only its OPEN places (p5Classes minus accepted).
      // Math.max(0, ...) stops a negative number if a school was over-filled.
      const schools = (await School.findByShow(show)).map((s) => ({
        _id: s._id,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        show: s.show,
        p5Classes: Math.max(0, s.p5Classes - (taken[String(s._id)] || 0)),
      }));

      results.push(...scarcityFirst(volunteers, schools, show));
    }

    // Check every record BEFORE deleting, so a bad record can never leave the table empty
    const problems = Assignments.validateMany(results);
    if (problems.length > 0) {
      return res.status(500).json({
        message: `Allocation not saved (${problems.length} invalid record(s)): ${problems[0]}`,
      });
    }

    // Remove only what is being re-calculated (or everything, on a reset), then save the new matches
    if (reset) await Assignments.deleteAll();
    else await Assignments.deleteReplaceable(skippedShows);
    await Assignments.createMany(results);
    const assignments = await Assignments.retrieveAll();
    // CHANGED: was the bare list; skippedShows tells the board which published shows were left alone
    res.json({ assignments, skippedShows });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/assignments/publish -- release the draft allocation to volunteers (admin only)
// body: { show?: "NE Show 1" }  (leave show out to publish every show)
// Until this is called, volunteers see "Awaiting allocation", so the admin can review and fix first.
exports.publishAssignments = async (req, res) => {
  try {
    const show = typeof req.body?.show === "string" ? req.body.show.trim() : "";
    // Reject unknown show names instead of silently publishing nothing
    if (show && !Assignments.SHOWS.includes(show)) {
      return res.status(400).json({ message: "Unknown show." });
    }

    const result = await Assignments.publish(show || null);
    // modifiedCount = how many rows were released (0 means everything was already published)
    res.json({ published: result.modifiedCount, show: show || "all" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/assignments/:id/accept -- logged in volunteer accepts their assignment
exports.acceptMyAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid assignment id" });
    }

    const assignment = await Assignments.acceptMine(id, req.session.userId);
    if (!assignment) {
      return res.status(404).json({ message: "No pending assignment found to accept." });
    }
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Shared by decline and withdraw. Deletes the volunteer's assignment, then logs it in their
// withdrawnShows (show id, reporting date / time / location, status, reason) and removes the show
// from their availableShows. body: { reason?: "..." }
async function leaveAssignment(req, res, status) {
  const { id } = req.params;
  // a malformed id would make MongoDB throw, so answer 400 before querying
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid assignment id" });
  }

  // reason is optional; trim() removes stray spaces, and a missing body (req.body undefined) gives ''
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length > 300) {
    return res.status(400).json({ message: "Reason must be 300 characters or fewer." });
  }

  // the session user id (not a body field) decides whose row is removed, so nobody can act for someone else
  const userId = req.session.userId;
  const assignment = status === "Declined"
    ? await Assignments.declineMine(id, userId)
    : await Assignments.withdrawMine(id, userId);
  // nothing matched = not yours, wrong status, or not published yet
  if (!assignment) {
    const message = status === "Declined"
      ? "No pending assignment found to decline."
      : "No accepted assignment found to withdraw from.";
    return res.status(404).json({ message });
  }

  const show = await Shows.findByName(assignment.show);
  const entry = {
    showId: show?._id,
    show: assignment.show,
    reportingDate: show?.date,
    reportingTime: assignment.school?.reportingTime,
    reportingLocation: assignment.school?.name,
    status,
    reason,
  };

  try {
    const user = await Account.logWithdrawnShow(userId, entry);
    // Their place is open now: give it to the nearest volunteer on the reserve list straight away.
    // The decline / withdrawal has already succeeded, so a problem here is only logged, never sent to the volunteer.
    try {
      const filled = await fillOpenPlaces(assignment.show);
      if (filled.length > 0) console.log(`Auto-replacement: filled ${filled.length} place(s) in ${assignment.show}`);
    } catch (fillError) {
      console.error(`Auto-replacement for ${assignment.show} failed:`, fillError.message);
    }
    res.json({ entry, availableShows: user?.availableShows || [] });
  } catch (error) {
    // logging failed: put the assignment back so the volunteer does not silently lose their place
    const restored = assignment.toObject();
    restored.school = assignment.school?._id;
    await Assignments.restore(restored);
    throw error;
  }
}

// PATCH /api/assignments/:id/decline -- logged in volunteer declines a pending assignment
exports.declineMyAssignment = async (req, res) => {
  try {
    await leaveAssignment(req, res, "Declined");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/assignments/:id/withdraw -- logged in volunteer withdraws from an accepted assignment
exports.withdrawMyAssignment = async (req, res) => {
  try {
    await leaveAssignment(req, res, "Withdrawn");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
