// The chat read-state database model: when each side last read a conversation.

const mongoose = require("mongoose");

const ThreadStateSchema = new mongoose.Schema(
  {
    volunteer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      unique: true
    },
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

// get(volunteerId) - the read-state record of a chat, or null.
exports.get = (volunteerId) => ThreadState.findOne({ volunteer: volunteerId });

// markRead(volunteerId, side, upTo) - 1) pick the field (adminLastReadAt or volunteerLastReadAt) 2)
// $max only ever moves the time FORWARD 3) upsert creates the record the first time.
exports.markRead = (volunteerId, side, upTo) =>
  ThreadState.findOneAndUpdate(
    { volunteer: volunteerId },
    { $max: { [side === "admin" ? "adminLastReadAt" : "volunteerLastReadAt"]: upTo } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

// backfillLegacy() - runs once at startup to repair old chats. 1) find each chat's latest message time
// 2) find chats that already have a read-state record 3) for the rest create a record marked "read up
// to the latest message" so old chats do not all show as unread 4) any error is only logged (never
// blocks startup).
exports.backfillLegacy = async () => {
  try {
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
    console.error("ThreadState backfill failed:", err.message);
  }
};
