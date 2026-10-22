// Live chat events for the HQ <-> volunteer chat. Called once for every new socket from sockets/index.js.
//
// Rooms we reuse from index.js (no new rooms needed):
//   "hq"             every admin
//   "user:<userId>"  one person (so "user:<volunteerId>" reaches that volunteer, in any of their tabs)
//
// Client -> server:  typing { volunteerId? }     read { volunteerId?, upTo? }
// Server -> client:  typing, read:update, presence:update, presence:list
// (message:new, thread:updated and thread:closed are sent from the messages controller)

const mongoose = require("mongoose");
const presence = require("./presence");
const ThreadState = require("../models/thread-state-model");
const Message = require("../models/messages-model");

// Which volunteer's chat is this about? A volunteer can only ever mean their own chat (anything they send is ignored).
// An admin must say which volunteer, and the id must be valid.
function threadOf(role, userId, requestedId) {
  if (role === "volunteer") return String(userId);
  if (role === "admin" && mongoose.isValidObjectId(requestedId)) return String(requestedId);
  return null;
}

function registerChat(io, socket) {
  const { userId, role } = socket.request.session;

  // ---- Presence: HQ sees which volunteers are online ----
  if (role === "volunteer") {
    if (presence.connected(userId)) {
      io.to("hq").emit("presence:update", { volunteerId: String(userId), online: true });
    }
  } else if (role === "admin") {
    // This admin missed earlier presence events, so send them the current list
    socket.emit("presence:list", presence.onlineIds());
  }

  // ---- Typing: never saved, just passed to the other side ----
  socket.on("typing", (payload = {}) => {
    const vid = threadOf(role, userId, payload.volunteerId);
    if (!vid) return;
    const data = { volunteerId: vid, role };
    // socket.to(...) sends to everyone in that room EXCEPT the sender
    if (role === "volunteer") {
      socket.to("hq").emit("typing", data);
    } else {
      socket.to(`user:${vid}`).emit("typing", data); // the volunteer sees "HQ is typing"
      socket.to("hq").emit("typing", data); // other admins see it too, so two admins don't reply at once
    }
  });

  // ---- Read receipt: "I have seen everything up to upTo" ----
  socket.on("read", async (payload = {}) => {
    try {
      const vid = threadOf(role, userId, payload.volunteerId);
      if (!vid) return;

      // Use the time of the last message the browser actually SAW, so a message that arrives at the same
      // moment is not wrongly marked as read. A time in the future is not allowed.
      const now = new Date();
      let upTo = payload.upTo ? new Date(payload.upTo) : now;
      if (Number.isNaN(upTo.getTime())) return;
      if (upTo > now) upTo = now;

      await ThreadState.markRead(vid, role, upTo);

      const data = { volunteerId: vid, role, readAt: upTo };
      io.to(`user:${vid}`).emit("read:update", data); // lets the volunteer's screen show "Seen"
      io.to("hq").emit("read:update", data);

      if (role === "admin") {
        // The admin side is shared, so every admin's badge for this chat clears
        const summary = await Message.threadSummary(vid);
        io.to("hq").emit("thread:updated", { ...summary, online: presence.isOnline(vid) });
      }
    } catch (error) {
      console.error("socket read error:", error.message);
    }
  });

  socket.on("disconnect", () => {
    if (role === "volunteer" && presence.disconnected(userId)) {
      io.to("hq").emit("presence:update", { volunteerId: String(userId), online: false });
    }
  });
}

module.exports = { registerChat };
