// The live chat socket events: typing, read and disconnect, plus the online presence updates.

const mongoose = require("mongoose");
const presence = require("./presence");
const ThreadState = require("../models/thread-state-model");
const Message = require("../models/messages-model");

// threadOf(role, userId, requestedId) - which volunteer's chat does a socket message mean? Volunteer
// -> always their own id; admin -> the id they sent if it is a valid id; otherwise null (ignored).
function threadOf(role, userId, requestedId) {
  if (role === "volunteer") return String(userId);
  if (role === "admin" && mongoose.isValidObjectId(requestedId)) return String(requestedId);
  return null;
}

// registerChat(io, socket) - chat handlers for ONE connected socket: 1. Presence: a volunteer's FIRST
// connection tells HQ they are online; a newly connected admin receives the list of who is online. 2.
// "typing": pass it on to the other side only (never saved). 3. "read": validate the chat, clamp the
// time (not in the future), save it, tell both sides ("read:update"), and if an admin read it refresh
// every admin's inbox row. 4. "disconnect": when a volunteer's LAST connection closes, tell HQ they
// are offline.
function registerChat(io, socket) {
  const { userId, role } = socket.request.session;

  if (role === "volunteer") {
    if (presence.connected(userId)) {
      io.to("hq").emit("presence:update", { volunteerId: String(userId), online: true });
    }
  } else if (role === "admin") {
    socket.emit("presence:list", presence.onlineIds());
  }

  // ---- Typing: never saved, just passed to the other side ----
  socket.on("typing", (payload = {}) => {
    const vid = threadOf(role, userId, payload.volunteerId);
    if (!vid) return;
    const data = { volunteerId: vid, role };
    if (role === "volunteer") {
      socket.to("hq").emit("typing", data);
    } else {
      socket.to(`user:${vid}`).emit("typing", data);
      socket.to("hq").emit("typing", data);
    }
  });

  // ---- Read receipt: "I have seen everything up to upTo" ----
  socket.on("read", async (payload = {}) => {
    try {
      const vid = threadOf(role, userId, payload.volunteerId);
      if (!vid) return;

      const now = new Date();
      let upTo = payload.upTo ? new Date(payload.upTo) : now;
      if (Number.isNaN(upTo.getTime())) return;
      if (upTo > now) upTo = now;

      await ThreadState.markRead(vid, role, upTo);

      const data = { volunteerId: vid, role, readAt: upTo };
      io.to(`user:${vid}`).emit("read:update", data);
      io.to("hq").emit("read:update", data);

      if (role === "admin") {
        const summary = await Message.threadSummary(vid);
        io.to("hq").emit("thread:updated", { ...summary, online: presence.isOnline(vid) });
      }
    } catch (error) {
      console.error("socket read error:", error.message);
    }
  });

  // disconnect - when a volunteer's last connection drops, tell HQ they are offline.
  socket.on("disconnect", () => {
    if (role === "volunteer" && presence.disconnected(userId)) {
      io.to("hq").emit("presence:update", { volunteerId: String(userId), online: false });
    }
  });
}

module.exports = { registerChat };
