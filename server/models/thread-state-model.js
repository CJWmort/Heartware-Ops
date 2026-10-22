const mongoose = require("mongoose");

// One small record per volunteer chat that remembers "read up to here" for each side.
// The messages themselves stay in the messages collection; this only powers the unread badges.
// All admins share ONE admin side: when any admin reads a chat, it counts as read for every admin.
const ThreadStateSchema = new mongoose.Schema(
  {
    volunteer: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Account", 
      required: true, 
      unique: true 
    },
    // Epoch (1970) = "never read", so a brand new chat shows as unread for the person who did not send it
    volunteerLastReadAt: { 
      type: Date, 
      default: () => new Date(0) 
    },
    adminLastReadAt: { 
      type: Date, 
      default: () => new Date(0) 
    },
  },
  { timestamps: true },
);

const ThreadState = mongoose.model("ThreadState", ThreadStateSchema, "threadstates");

exports.get = (volunteerId) => ThreadState.findOne({ volunteer: volunteerId });

// side is "admin" or "volunteer". $max only ever moves the time forward, and upsert creates the record the first time.
exports.markRead = (volunteerId, side, upTo) =>
  ThreadState.findOneAndUpdate(
    { volunteer: volunteerId },
    { $max: { [side === "admin" ? "adminLastReadAt" : "volunteerLastReadAt"]: upTo } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

// Used when HQ closes a chat
exports.remove = (volunteerId) => ThreadState.deleteOne({ volunteer: volunteerId });

// Runs once at startup. Chats created before ThreadState existed have messages but no read-state record,
// and a missing record counts as "never read" (so every old chat would show as unread).
// For each such chat we create a record marked read up to its latest message. Safe to run on every boot:
// threads that already have a record are skipped, so it never overwrites real read times.
exports.backfillLegacy = async () => {
  try {
    // Native collection used on purpose: requiring messages-model here would create a circular import.
    const messages = mongoose.connection.collection("messages");
    const latest = await messages
      .aggregate([{ $group: { _id: "$thread", lastAt: { $max: "$createdAt" } } }])
      .toArray();
    if (!latest.length) return;

    const existing = new Set((await ThreadState.find({}, { volunteer: 1 }).lean()).map((s) => String(s.volunteer)));
    const missing = latest.filter((t) => !existing.has(String(t._id)));
    if (!missing.length) return;

    await ThreadState.insertMany(
      missing.map((t) => ({ volunteer: t._id, volunteerLastReadAt: t.lastAt, adminLastReadAt: t.lastAt })),
      { ordered: false },
    );
    console.log(`ThreadState backfill: created ${missing.length} record(s)`);
  } catch (err) {
    // A backfill problem should never stop the server from starting
    console.error("ThreadState backfill failed:", err.message);
  }
};
