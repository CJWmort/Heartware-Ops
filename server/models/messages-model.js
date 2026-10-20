const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema(
  {
    // Which volunteer's conversation this belongs to. A "thread" is one volunteer <-> HQ chat,
    // so we label every message with the volunteer's id. That is how we find the whole conversation later.
    thread: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true }, // who typed it
    senderRole: { type: String, enum: ["admin", "volunteer"], required: true }, // lets the UI show "HQ" vs "Volunteer"
    text: { type: String, required: true, trim: true, maxlength: 1000 }, // trim removes spaces at both ends
  },
  { timestamps: true }, // Mongo adds createdAt automatically, which we use as the message time
);

const Message = mongoose.model("Message", MessageSchema, "messages");

// Whole conversation, oldest first so it reads top to bottom. Limit stops a huge chat from loading at once.
exports.retrieveThread = (threadId) =>
  Message.find({ thread: threadId }).sort({ createdAt: 1 }).limit(200);
exports.create = (data) => Message.create(data);
// Latest message of every thread (used for the HQ inbox preview line)
exports.latestPerThread = () =>
  Message.aggregate([
    { $sort: { createdAt: -1 } }, // newest first...
    { $group: { _id: "$thread", lastText: { $first: "$text" }, lastAt: { $first: "$createdAt" } } }, // ...so $first = newest
  ]);
