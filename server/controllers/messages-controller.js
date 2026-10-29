const mongoose = require("mongoose");
const Message = require("../models/messages-model");
const ThreadState = require("../models/thread-state-model");
const Account = require("../models/account-model");
const presence = require("../sockets/presence");
const { emit } = require("../sockets"); // same helper the incidents controller uses
const sendServerError = require('../utils/send-server-error')

// Decides WHOSE conversation this request is about.
// Volunteer: always their own (we ignore anything they send, so they can't read someone else's chat).
// Admin: must say which volunteer.
function threadFor(req, source) {
  return req.session.role === "admin" ? source.volunteerId : req.session.userId;
}

// GET /api/messages?volunteerId=...   (volunteerId only needed for admin)
exports.listMessages = async (req, res) => {
  try {
    const thread = threadFor(req, req.query);
    if (!thread) return res.status(400).json({ message: "volunteerId is required" });
    // FIX: an admin sending a malformed volunteerId caused a 500; answer 400 instead
    if (!mongoose.isValidObjectId(thread)) return res.status(400).json({ message: "Invalid volunteer" });
    res.json(await Message.retrieveThread(thread));
  } catch (error) {
    sendServerError(res, error);
  }
};

// GET /api/messages/read-state?volunteerId=...  (volunteerId only needed for admin)
// -> { volunteerLastReadAt, adminLastReadAt }. The client uses the OTHER side's time to show "Seen" under my messages.
exports.getReadState = async (req, res) => {
  try {
    const thread = threadFor(req, req.query);
    if (!thread) return res.status(400).json({ message: "volunteerId is required" });
    if (!mongoose.isValidObjectId(thread)) return res.status(400).json({ message: "Invalid volunteer" });
    const state = await ThreadState.get(thread);
    res.json({
      volunteerLastReadAt: state?.volunteerLastReadAt || null,
      adminLastReadAt: state?.adminLastReadAt || null,
    });
  } catch (error) {
    sendServerError(res, error);
  }
};

// POST /api/messages   body: { text, volunteerId? }
exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "Message cannot be empty" });
    if (text.length > 1000) return res.status(400).json({ message: "Message is too long (max 1000)" });

    const thread = threadFor(req, req.body);
    if (!thread) return res.status(400).json({ message: "volunteerId is required" });
    if (!mongoose.isValidObjectId(thread)) return res.status(400).json({ message: "Invalid volunteer" });

    // Admin only: make sure the target really is a volunteer, so HQ can't create chats with random ids
    if (req.session.role === "admin") {
      const volunteer = await Account.findById(thread);
      if (!volunteer || volunteer.role !== "volunteer")
        return res.status(404).json({ message: "Volunteer not found" });
    }

    const message = await Message.create({
      thread,
      sender: req.session.userId, // from the login session, NOT from the request body, so it can't be faked
      senderRole: req.session.role,
      text,
    });

    // sending a message counts as "read" for the sender's own side
    await ThreadState.markRead(thread, req.session.role, message.createdAt);

    // Push to both people in this chat: the volunteer's private room and the HQ room.
    emit("message:new", message, `user:${thread}`);
    emit("message:new", message, "hq");
    // update the HQ thread list (preview line, order, unread badge, online dot) for every admin
    const summary = await Message.threadSummary(thread);
    emit("thread:updated", { ...summary, online: presence.isOnline(thread) }, "hq");

    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/messages/threads  (admin only) -> every volunteer + their latest message, newest chats first
exports.listThreads = async (req, res) => {
  try {
    const [volunteers, latest, unread] = await Promise.all([
      Account.retrieveVolunteers(),
      Message.latestPerThread(),
      Message.unreadForAdmin(), // NEW
    ]);
    const latestById = new Map(latest.map((t) => [String(t._id), t])); // quick lookup by volunteer id
    const unreadById = new Map(unread.map((t) => [String(t._id), t.unread]));
    const threads = volunteers.map((v) => {
      const last = latestById.get(String(v._id));
      return {
        volunteerId: v._id,
        name: v.name,
        lastText: last?.lastText || "",
        lastAt: last?.lastAt || null,
        unreadAdmin: unreadById.get(String(v._id)) || 0, // for the badge
        online: presence.isOnline(v._id), // green dot
      };
    });
    // Chats with messages first (newest on top), volunteers with no chat yet go to the bottom
    threads.sort(
      (a, b) => (b.lastAt ? +new Date(b.lastAt) : 0) - (a.lastAt ? +new Date(a.lastAt) : 0),
    );
    res.json(threads);
  } catch (error) {
    sendServerError(res, error);
  }
};

// GET /api/messages/unread -> { unread: number } for the navbar badge
// Volunteer: unread in their own chat. Admin: unread across every chat.
exports.getUnread = async (req, res) => {
  try {
    if (req.session.role === "admin") {
      const perThread = await Message.unreadForAdmin();
      return res.json({ unread: perThread.reduce((sum, t) => sum + t.unread, 0) });
    }
    res.json({ unread: await Message.unreadForVolunteer(req.session.userId) });
  } catch (error) {
    sendServerError(res, error);
  }
};
