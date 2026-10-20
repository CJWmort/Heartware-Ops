const Message = require("../models/messages-model");
const Account = require("../models/account-model");
const { emit } = require("../sockets"); // same helper the incidents controller uses

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
    res.json(await Message.retrieveThread(thread));
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    // Push to both people in this chat: the volunteer's private room and the HQ room.
    emit("message:new", message, `user:${thread}`);
    emit("message:new", message, "hq");
    res.status(201).json(message);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/messages/threads  (admin only) -> every volunteer + their latest message, newest chats first
exports.listThreads = async (req, res) => {
  try {
    const [volunteers, latest] = await Promise.all([
      Account.retrieveVolunteers(),
      Message.latestPerThread(),
    ]);
    const latestById = new Map(latest.map((t) => [String(t._id), t])); // quick lookup by volunteer id
    const threads = volunteers.map((v) => {
      const last = latestById.get(String(v._id));
      return {
        volunteerId: v._id,
        name: v.name,
        lastText: last?.lastText || "",
        lastAt: last?.lastAt || null,
      };
    });
    // Chats with messages first (newest on top), volunteers with no chat yet go to the bottom
    threads.sort(
      (a, b) => (b.lastAt ? +new Date(b.lastAt) : 0) - (a.lastAt ? +new Date(a.lastAt) : 0),
    );
    res.json(threads);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
