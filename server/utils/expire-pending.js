// Lapses pending offers whose deadline has passed and offers the places to reserve volunteers.

const Assignments = require("../models/assignments-model");
const Account = require("../models/account-model");
const Shows = require("../models/shows-model");
const { replaceFromReserve } = require("./reserve-replacement");

// expireOverduePending() - lets unanswered offers lapse after 24 hours (no scheduler: runs whenever
// pages load, an offer is accepted, or Allocate is pressed). 1. Find overdue Pending offers. 2. For
// each, delete it only if it is still Pending and still overdue (a last-second accept wins). 3. Log it
// in the volunteer's withdrawnShows as "Declined - No response within 24 hours"; if logging fails put
// the row back. 4. For every show that lost a place, fill it from the reserve list. 5. Return how many
// shows had a place freed.
async function expireOverduePending() {
  const overdue = await Assignments.findOverduePending();
  const touchedShows = new Set();

  for (const { _id } of overdue) {
    const row = await Assignments.deleteIfOverdue(_id);
    if (!row) continue;
    try {
      const show = await Shows.findByName(row.show);
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
      const restored = row.toObject();
      restored.school = row.school?._id;
      await Assignments.restore(restored);
      console.error("Expiry logging failed:", error.message);
    }
  }

  for (const show of touchedShows) {
    try {
      await replaceFromReserve(show);
    } catch (error) {
      console.error(`Reserve replacement for ${show} failed:`, error.message);
    }
  }
  return touchedShows.size;
}

module.exports = { expireOverduePending };
