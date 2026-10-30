// Assignment endpoints: list, run the allocation, publish, accept, decline, withdraw and the journey
// stage steps.

const mongoose = require("mongoose");
const Assignments = require("../models/assignments-model");
const Account = require("../models/account-model");
const School = require("../models/schools-model");
const Shows = require("../models/shows-model");
const { replaceFromReserve, topUpPublishedShow } = require("../utils/reserve-replacement");
const { expireOverduePending } = require("../utils/expire-pending");
const { emit } = require("../sockets");
const dotenv = require("dotenv");

const { scarcityFirst } = require("../utils/scarcityFirst");
const { greedyByPair } = require("../utils/greedy");
const sendServerError = require('../utils/send-server-error')

// getAssignments (admin) - every assignment. 1) first lapse any unanswered offers whose deadline has
// passed (a failure is only logged) 2) load all assignments 3) reply with them (500 on error).
exports.getAssignments = async (req, res) => {
  try {
    await expireOverduePending().catch((e) => console.error("Expiry sweep failed:", e.message));
    const assignments = await Assignments.retrieveAll();
    res.json(assignments);
  } catch (error) {
    sendServerError(res, error);
  }
};

// getMyAssignments - the logged-in volunteer's own assignments. 1) lapse overdue offers 2) load rows
// for req.session.userId 3) withToday() hides stage data that belongs to an earlier day 4) reply.
exports.getMyAssignments = async (req, res) => {
  try {
    await expireOverduePending().catch((e) => console.error("Expiry sweep failed:", e.message));
    const assignments = await Assignments.findMine(req.session.userId);
    res.json(assignments.map((a) => Assignments.withToday(a)));
  } catch (error) {
    sendServerError(res, error);
  }
};

// readStageRequest(source) - checks a checkpoint request. 1) read show (trimmed) and stage (as a
// number) 2) show must be one of the known shows 3) stage must be a whole number from 1 to MAX_STAGE
// (8) 4) valid -> { show, stage }, otherwise null.
function readStageRequest(source) {
  const show = String(source.show || "").trim();
  const stage = Number(source.stage);
  if (!Assignments.SHOWS.includes(show)) return null;
  if (!Number.isInteger(stage) || stage < 1 || stage > Assignments.MAX_STAGE) return null;
  return { show, stage };
}

// stageReply(a) - builds the answer both checkpoint endpoints send back: today's view of the
// assignment reduced to { show, stage, stageHistory }.
function stageReply(a) {
  const o = Assignments.withToday(a);
  return { show: o.show, stage: o.stage, stageHistory: o.stageHistory };
}

// advanceMyStage (PUT /me/stage) - volunteer clocks the NEXT checkpoint. 1) validate show + stage
// (else 400) 2) ask the model to move from stage-1 to stage for this volunteer 3) problem "none" ->
// 403 (no accepted assignment) 4) problem "conflict" -> 409 plus the real current stage (double tap /
// second phone) 5) success -> reply with stageReply.
exports.advanceMyStage = async (req, res) => {
  try {
    const input = readStageRequest(req.body || {});
    if (!input) return res.status(400).json({ message: "A valid show and stage (1-8) are required." });

    const result = await Assignments.advanceStage(req.session.userId, input.show, input.stage);
    if (result.problem === "none") return res.status(403).json({ message: "No accepted assignment for this show." });
    if (result.problem === "conflict") return res.status(409).json({ message: "Your stage has changed. Refreshed.", stage: result.stage });
    res.json(stageReply(result.assignment));
  } catch (error) {
    console.error("advanceMyStage failed:", error);
    res.status(500).json({ message: "Could not save your checkpoint." });
  }
};

// undoMyStage (DELETE /me/stage) - volunteer removes the LAST checkpoint. Same flow as advanceMyStage
// but calls undoStage; "stage" in the query is the stage they are leaving.
exports.undoMyStage = async (req, res) => {
  try {
    const input = readStageRequest(req.query || {});
    if (!input) return res.status(400).json({ message: "A valid show and stage (1-8) are required." });

    const result = await Assignments.undoStage(req.session.userId, input.show, input.stage);
    if (result.problem === "none") return res.status(403).json({ message: "No accepted assignment for this show." });
    if (result.problem === "conflict") return res.status(409).json({ message: "Your stage has changed. Refreshed.", stage: result.stage });
    res.json(stageReply(result.assignment));
  } catch (error) {
    console.error("undoMyStage failed:", error);
    res.status(500).json({ message: "Could not undo your checkpoint." });
  }
};

// getShowAssignments (admin) - assignments for one show: 1) read :show from the URL 2) query by show
// 3) reply.
exports.getShowAssignments = async (req, res) => {
  try {
    const show = req.params.show;
    const assignments = await Assignments.findByShow(show);
    res.json(assignments);
  } catch (error) {
    sendServerError(res, error);
  }
};

// runAssignments (POST /run, admin) - the allocation run. 1) lapse overdue pending offers, 2) read
// reset (wipe everything) and an optional single show name (unknown name gives 400), 3) unless reset,
// keep accepted, declined and withdrawn rows and skip shows that are already published, 4) for each
// show to run, match volunteers to schools, 5) save the new draft rows, 6) reply with the results and
// send a live update.
exports.runAssignments = async (req, res) => {
  try {
    await expireOverduePending().catch((e) => console.error("Expiry sweep failed:", e.message));
    const reset = req.body?.reset === true;
    const only = typeof req.body?.show === "string" ? req.body.show.trim() : "";
    if (only && !Assignments.SHOWS.includes(only)) {
      return res.status(400).json({ message: "Unknown show." });
    }
    const showsToRun = only ? [only] : Assignments.SHOWS;
    const kept = reset ? [] : await Assignments.findKept();
    const skippedShows = (reset ? [] : await Assignments.publishedShows()).filter((s) => showsToRun.includes(s));

    const results = [];
    for (const show of showsToRun) {
      if (skippedShows.includes(show)) continue;
      const keptInShow = kept.filter((a) => a.show === show);

      const locked = new Set(keptInShow.map((a) => String(a.volunteer)));

      const taken = {};
      for (const a of keptInShow) {
        if (a.status === "Accepted" && a.school) {
          taken[String(a.school)] = (taken[String(a.school)] || 0) + 1;
        }
      }

      const volunteers = (await Account.findVolunteersByShow(show)).filter(
        (v) => !locked.has(String(v._id)),
      );
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

    const problems = Assignments.validateMany(results);
    if (problems.length > 0) {
      return res.status(500).json({
        message: `Allocation not saved (${problems.length} invalid record(s)): ${problems[0]}`,
      });
    }

    const rerunShows = showsToRun.filter((s) => !skippedShows.includes(s));
    if (reset) await Assignments.deleteAll(only || null);
    else await Assignments.deleteReplaceable(rerunShows);
    await Assignments.createMany(results);

    const toppedUp = {};
    for (const show of skippedShows) toppedUp[show] = await topUpPublishedShow(show);

    const assignments = await Assignments.retrieveAll();
    emit("assignments:updated", { reason: reset ? "reset" : "allocate", shows: showsToRun });
    res.json({ assignments, skippedShows, toppedUp });
  } catch (error) {
    sendServerError(res, error);
  }
};

// publishAssignments (POST /publish, admin) - releases the draft allocation to volunteers. 1) optional
// { show }, an unknown name gives 400, 2) mark the draft rows published (all shows if none given), 3)
// if any changed, send a live "assignments:updated" event, 4) reply with how many were published.
exports.publishAssignments = async (req, res) => {
  try {
    const show = typeof req.body?.show === "string" ? req.body.show.trim() : "";
    if (show && !Assignments.SHOWS.includes(show)) {
      return res.status(400).json({ message: "Unknown show." });
    }

    const result = await Assignments.publish(show || null);
    if (result.modifiedCount > 0) emit("assignments:updated", { reason: "publish", shows: show ? [show] : Assignments.SHOWS });
    res.json({ published: result.modifiedCount, show: show || "all" });
  } catch (error) {
    sendServerError(res, error);
  }
};

// acceptMyAssignment (PATCH /:id/accept) - 1) lapse overdue offers 2) the id must be a valid Mongo id
// (else 400) 3) accept only if the row is PENDING, belongs to this volunteer and is published (else
// 404) 4) reply with the updated assignment.
exports.acceptMyAssignment = async (req, res) => {
  try {
    await expireOverduePending().catch((e) => console.error("Expiry sweep failed:", e.message));
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
    sendServerError(res, error);
  }
};

// leaveAssignment(req, res, status) - shared by Decline and Withdraw. Steps: 1. Validate the id (400).
// 2. Read the optional reason (max 300 characters, else 400). 3. Delete the volunteer's row
// (declineMine for pending, withdrawMine for accepted); nothing matched -> 404. The user id comes from
// the session, so nobody can act for someone else. 4. Look up the show, build a record (show, date,
// time, school, status, reason) and log it in the volunteer's withdrawnShows (this also removes the
// show from availableShows). 5. Try to fill the freed place from the reserve list (failure is only
// logged). 6. Reply with the record and the volunteer's remaining availableShows. 7. If logging fails,
// put the deleted row back (restore) so the volunteer does not silently lose their place, then
// rethrow.
async function leaveAssignment(req, res, status) {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid assignment id" });
  }

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (reason.length > 300) {
    return res.status(400).json({ message: "Reason must be 300 characters or fewer." });
  }

  const userId = req.session.userId;
  const assignment = status === "Declined"
    ? await Assignments.declineMine(id, userId)
    : await Assignments.withdrawMine(id, userId);
  if (!assignment) {
    const message = status === "Declined"
      ? "No pending assignment found to decline."
      : "No accepted assignment found to withdraw from.";
    return res.status(404).json({ message });
  }

  try {
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
    const user = await Account.logWithdrawnShow(userId, entry);
    try {
      const filled = await replaceFromReserve(assignment.show);
      if (filled.length > 0) console.log(`Reserve replacement: filled ${filled.length} place(s) in ${assignment.show}`);
    } catch (fillError) {
      console.error(`Reserve replacement for ${assignment.show} failed:`, fillError.message);
    }
    res.json({ entry, availableShows: user?.availableShows || [] });
  } catch (error) {
    const restored = assignment.toObject();
    restored.school = assignment.school?._id;
    await Assignments.restore(restored);
    throw error;
  }
}

// declineMyAssignment (PATCH /:id/decline) - runs leaveAssignment with status "Declined"; any thrown
// error becomes a 500.
exports.declineMyAssignment = async (req, res) => {
  try {
    await leaveAssignment(req, res, "Declined");
  } catch (error) {
    sendServerError(res, error);
  }
};

// withdrawMyAssignment (PATCH /:id/withdraw) - runs leaveAssignment with status "Withdrawn"; any
// thrown error becomes a 500.
exports.withdrawMyAssignment = async (req, res) => {
  try {
    await leaveAssignment(req, res, "Withdrawn");
  } catch (error) {
    sendServerError(res, error);
  }
};
