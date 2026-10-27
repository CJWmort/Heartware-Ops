const mongoose = require("mongoose");
const ThreadState = require("./thread-state-model");

const MessageSchema = new mongoose.Schema(
  {
    // Which volunteer's conversation this belongs to. A "thread" is one volunteer <-> HQ chat,
    // so we label every message with the volunteer's id. That is how we find the whole conversation later.
    thread: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Account", 
      required: true, 
      index: true 
    },
    sender: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Account", 
      required: true 
    }, // who typed it
    senderRole: { 
      type: String, 
      enum: ["admin", "volunteer"], 
      required: true 
    }, // lets the UI show "HQ" vs "Volunteer"
    text: { 
      type: String, 
      required: true, 
      trim: true, 
      maxlength: 1000 
    }, // trim removes spaces at both ends
  },
  { timestamps: true }, // Mongo adds createdAt automatically, which we use as the message time
);

const Message = mongoose.model("Message", MessageSchema, "messages");

// Whole conversation, oldest first so it reads top to bottom. Limit stops a huge chat from loading at once.
exports.retrieveThread = async (threadId) => {
  // FIX: take the NEWEST 200 (sort descending) - before, oldest-first + limit hid every message after the 200th
  const latest = await Message.find({ thread: threadId }).sort({ createdAt: -1 }).limit(200);
  // flip back to oldest-first so the chat still reads top to bottom
  return latest.reverse();
};
exports.create = (data) => Message.create(data);
// Latest message of every thread (used for the HQ inbox preview line)
exports.latestPerThread = () =>
  Message.aggregate([
    { $sort: { createdAt: -1 } }, // newest first...
    { $group: { _id: "$thread", lastText: { $first: "$text" }, lastAt: { $first: "$createdAt" } } }, // ...so $first = newest
  ]);

// Volunteer's unread = HQ messages newer than the volunteer's last-read time
exports.unreadForVolunteer = async (volunteerId) => {
  const state = await ThreadState.get(volunteerId);
  return Message.countDocuments({
    thread: volunteerId,
    senderRole: "admin",
    createdAt: { $gt: state?.volunteerLastReadAt || new Date(0) },
  });
};

// HQ's unread per volunteer = volunteer messages newer than the shared admin last-read time.
// Returns [{ _id: volunteerId, unread: number }] only for chats that have unread messages.
exports.unreadForAdmin = () =>
  Message.aggregate([
    { $match: { senderRole: "volunteer" } },
    { $lookup: { from: "threadstates", localField: "thread", foreignField: "volunteer", as: "state" } },
    { $unwind: { path: "$state", preserveNullAndEmptyArrays: true } }, // chats never read have no state yet
    { $match: { $expr: { $gt: ["$createdAt", { $ifNull: ["$state.adminLastReadAt", new Date(0)] }] } } },
    { $group: { _id: "$thread", unread: { $sum: 1 } } },
  ]);

// One row for the HQ thread list (sent live whenever a chat changes)
exports.threadSummary = async (volunteerId) => {
  const last = await Message.findOne({ thread: volunteerId }).sort({ createdAt: -1 });
  const state = await ThreadState.get(volunteerId);
  const unreadAdmin = await Message.countDocuments({
    thread: volunteerId,
    senderRole: "volunteer",
    createdAt: { $gt: state?.adminLastReadAt || new Date(0) },
  });
  return {
    volunteerId: String(volunteerId),
    lastText: last?.text || "",
    lastAt: last?.createdAt || null,
    unreadAdmin,
  };
};
