// Chat endpoints: messages of a thread, send a message, the admin inbox, the unread count and the read
// state.

const mongoose = require("mongoose");
const Message = require("../models/messages-model");
const ThreadState = require("../models/thread-state-model");
const Account = require("../models/account-model");
const presence = require("../sockets/presence");
const { emit } = require("../sockets");
const sendServerError = require('../utils/send-server-error')

// threadFor(req, source) - decides whose conversation a request is about. A volunteer always gets
// their OWN id (anything they send is ignored, so they cannot read another chat); an admin must supply
// volunteerId.
function threadFor(req, source) {
  return req.session.role === "admin" ? source.volunteerId : req.session.userId;
}

// listMessages - 1) work out the thread (400 if missing or not a valid id) 2) reply with the newest
// 200 messages of it, oldest first.
exports.listMessages = async (req, res) => {
  try {
    const thread = threadFor(req, req.query);
    if (!thread) return res.status(400).json({ message: "volunteerId is required" });
    if (!mongoose.isValidObjectId(thread)) return res.status(400).json({ message: "Invalid volunteer" });
    res.json(await Message.retrieveThread(thread));
  } catch (error) {
    sendServerError(res, error);
  }
};

// getReadState - 1) work out the thread (400 on missing/invalid) 2) load the thread's read-state
// record 3) reply with when each side last read (null if never) - the client uses it to show "Seen".
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

// sendMessage - 1) text trimmed, must not be empty and at most 1000 characters (400) 2) work out the
// thread 3) admins: the target must really be a volunteer (404) 4) save the message with sender and
// role taken from the session (cannot be faked) 5) sending counts as "read" for the sender's side 6)
// push "message:new" to the volunteer's private room and to the HQ room 7) push an updated inbox row
// ("thread:updated") to HQ 8) reply 201.
exports.sendMessage = async (req, res) => {
  try {
    const text = String(req.body.text || "").trim();
    if (!text) return res.status(400).json({ message: "Message cannot be empty" });
    if (text.length > 1000) return res.status(400).json({ message: "Message is too long (max 1000)" });

    const thread = threadFor(req, req.body);
    if (!thread) return res.status(400).json({ message: "volunteerId is required" });
    if (!mongoose.isValidObjectId(thread)) return res.status(400).json({ message: "Invalid volunteer" });

    if (req.session.role === "admin") {
      const volunteer = await Account.findById(thread);
      if (!volunteer || volunteer.role !== "volunteer")
        return res.status(404).json({ message: "Volunteer not found" });
    }

    const message = await Message.create({
      thread,
      sender: req.session.userId,
      senderRole: req.session.role,
      text,
    });

    await ThreadState.markRead(thread, req.session.role, message.createdAt);

    emit("message:new", message, `user:${thread}`);
    emit("message:new", message, "hq");
    const summary = await Message.threadSummary(thread);
    emit("thread:updated", { ...summary, online: presence.isOnline(thread) }, "hq");

    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// listThreads (admin) - the HQ inbox. 1) load volunteers, each chat's latest message and unread counts
// at the same time 2) build one row per volunteer (name, last text/time, unread count, online dot) 3)
// sort chats with messages first (newest on top), volunteers without a chat at the bottom 4) reply.
exports.listThreads = async (req, res) => {
  try {
    const [volunteers, latest, unread] = await Promise.all([
      Account.retrieveVolunteers(),
      Message.latestPerThread(),
      Message.unreadForAdmin(),
    ]);
    const latestById = new Map(latest.map((t) => [String(t._id), t]));
    const unreadById = new Map(unread.map((t) => [String(t._id), t.unread]));
    const threads = volunteers.map((v) => {
      const last = latestById.get(String(v._id));
      return {
        volunteerId: v._id,
        name: v.name,
        lastText: last?.lastText || "",
        lastAt: last?.lastAt || null,
        unreadAdmin: unreadById.get(String(v._id)) || 0,
        online: presence.isOnline(v._id),
      };
    });
    threads.sort(
      (a, b) => (b.lastAt ? +new Date(b.lastAt) : 0) - (a.lastAt ? +new Date(a.lastAt) : 0),
    );
    res.json(threads);
  } catch (error) {
    sendServerError(res, error);
  }
};

// getUnread - number for the navbar badge. Admin: total unread across every chat. Volunteer: unread HQ
// messages in their own chat.
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
