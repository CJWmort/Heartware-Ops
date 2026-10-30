// The chat message database model and the queries for threads and unread counts.

const mongoose = require("mongoose");
const ThreadState = require("./thread-state-model");

const MessageSchema = new mongoose.Schema(
  {
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
    },
    senderRole: {
      type: String,
      enum: ["admin", "volunteer"],
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
  },
  { timestamps: true },
);

const Message = mongoose.model("Message", MessageSchema, "messages");

// retrieveThread(threadId) - 1) load the thread's messages NEWEST first, keep only 200 2) reverse so
// the chat reads oldest to newest, top to bottom.
exports.retrieveThread = async (threadId) => {
  const latest = await Message.find({ thread: threadId }).sort({ createdAt: -1 }).limit(200);
  return latest.reverse();
};
// create(data) - saves a new message.
exports.create = (data) => Message.create(data);
// latestPerThread() - the newest message of every chat (for the HQ inbox preview line): 1) sort all
// messages newest first 2) group by thread 3) $first of each group = that chat's newest text and time.
exports.latestPerThread = () =>
  Message.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$thread", lastText: { $first: "$text" }, lastAt: { $first: "$createdAt" } } },
  ]);

// unreadForVolunteer(volunteerId) - 1) load the chat's read-state 2) count HQ (admin) messages newer
// than the volunteer's last-read time (epoch = never read).
exports.unreadForVolunteer = async (volunteerId) => {
  const state = await ThreadState.get(volunteerId);
  return Message.countDocuments({
    thread: volunteerId,
    senderRole: "admin",
    createdAt: { $gt: state?.volunteerLastReadAt || new Date(0) },
  });
};

// unreadForAdmin() - unread counts for HQ, one row per chat that has unread messages. 1) keep
// volunteer-sent messages 2) join each chat's read-state 3) keep messages newer than the shared admin
// last-read time 4) group by chat and count.
exports.unreadForAdmin = () =>
  Message.aggregate([
    { $match: { senderRole: "volunteer" } },
    { $lookup: { from: "threadstates", localField: "thread", foreignField: "volunteer", as: "state" } },
    { $unwind: { path: "$state", preserveNullAndEmptyArrays: true } },
    { $match: { $expr: { $gt: ["$createdAt", { $ifNull: ["$state.adminLastReadAt", new Date(0)] }] } } },
    { $group: { _id: "$thread", unread: { $sum: 1 } } },
  ]);

// threadSummary(volunteerId) - one inbox row. 1) newest message 2) read-state 3) count unread
// volunteer messages for HQ 4) return { volunteerId, lastText, lastAt, unreadAdmin }.
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
