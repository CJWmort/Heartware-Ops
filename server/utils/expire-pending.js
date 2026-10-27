// Lets unanswered Pending offers lapse after 24 hours (the deadline is set in assignments-model.js).
// Treated like a decline: the row is deleted, logged in the volunteer's withdrawnShows, and the freed place goes
// to the nearest reserve. There is no scheduler: this runs whenever the board / the volunteer page loads,
// when an assignment is accepted, and when Allocate is pressed.
const Assignments = require("../models/assignments-model");
const Account = require("../models/account-model");
const Shows = require("../models/shows-model");
const { replaceFromReserve } = require("./reserve-replacement");

// Returns how many shows had a place freed.
async function expireOverduePending() {
  const overdue = await Assignments.findOverduePending();
  const touchedShows = new Set(); // shows that now have a free place

  for (const { _id } of overdue) {
    // deleted only if it is still Pending and still overdue, so a last-second accept is never undone
    const row = await Assignments.deleteIfOverdue(_id);
    if (!row) continue;
    try {
      const show = await Shows.findByName(row.show);
      // the same record a manual decline leaves, so the history page needs no changes
      await Account.logWithdrawnShow(row.volunteer, {
        showId: show?._id,
        show: row.show,
        reportingDate: show?.date,
        reportingTime: row.school?.reportingTime,
        reportingLocation: row.school?.name,
        status: "Declined",
        reason: "No response within 24 hours",
      });
      touchedShows.add(row.show);
    } catch (error) {
      // same safety as leaveAssignment: if logging fails, put the row back so nobody silently loses a place
      const restored = row.toObject();
      restored.school = row.school?._id;
      await Assignments.restore(restored);
      console.error("Expiry logging failed:", error.message);
    }
  }

  for (const show of touchedShows) {
    try {
      await replaceFromReserve(show); // nearest reserve takes the free place (and gets their own 24 hours)
    } catch (error) {
      console.error(`Reserve replacement for ${show} failed:`, error.message);
    }
  }
  return touchedShows.size;
}

module.exports = { expireOverduePending };
