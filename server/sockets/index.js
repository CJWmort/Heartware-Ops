// Socket.IO live updates – BONUS feature. Owner: Wei Ming (F4)
// Docs: https://socket.io/docs/v4/
//
// Server → client events we agreed on (see docs/API.md):
//   incident:new, incident:updated, alert:new, tracking:update
// Chat events (see sockets/chat.js and controllers/messages-controller.js):
//   message:new, thread:updated, typing, read:update, presence:update, presence:list
//
// From any controller you can broadcast with:
//   const { emit } = require('../sockets')
//   emit('incident:new', incident)

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { registerChat } = require("./chat"); // live chat events

let io = null;

function initSockets(httpServer, sessionMiddleware) {
  const origins = (process.env.CLIENT_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim()); // FIX: trim, so "a, b" works;
  // FIX: credentials: true lets the browser send the login cookie with the socket handshake
  // (the old TODO planned a JWT, but this app uses cookie sessions, so the cookie is the proof of login).
  io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  // FIX (security): before, anyone could open a socket and receive every incident as it was reported.
  // Run the normal express-session middleware on the socket handshake so socket.request.session is filled in.
  // Run the login-session check only on the FIRST request of a socket connection (the "handshake"),
  // which has no "sid" yet. Later polling requests already belong to a logged-in connection, so
  // skipping them avoids a MongoDB read on every poll and the header error that crashed the server.
  if (sessionMiddleware) {
    io.engine.use((req, res, next) => {
      const isHandshake = req._query.sid === undefined; // no sid = brand-new connection
      if (isHandshake) sessionMiddleware(req, res, next);
      else next(); // existing connection: skip the session check
    });
  }

  // Refuse anyone who is not logged in (no userId in the session) before the connection is accepted.
  io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.userId) return next();
    try {
      const { userId, role } = jwt.verify(socket.handshake.auth?.token, process.env.SECRET);
      socket.request.session = { userId, role };
      next();
    } catch {
      next(new Error("Please log in."));
    }
  });

  io.on("connection", (socket) => {
    const { userId, role } = socket.request.session;
    console.log("socket connected", socket.id, role);

    // Admins (coordinators at HQ) join the "hq" room. Incident events are sent to this room only,
    // so a volunteer's browser never receives other people's incident reports.
    if (role === "admin") socket.join("hq");
    socket.join(`user:${userId}`); // private room, for messages meant for one person

    registerChat(io, socket); // typing, read receipts and online/offline presence

    socket.on("disconnect", () => console.log("socket disconnected", socket.id));
  });

  return io;
}

// Safe to call even if sockets are not running (e.g. in tests).
function emit(eventName, payload, room) {
  if (!io) return;
  if (room) io.to(room).emit(eventName, payload);
  else io.emit(eventName, payload);
}

// NEW: close every open socket of one user (called on logout, so a logged-out browser stops receiving live events).
// Each user already joins the room "user:<id>" when they connect (see initSockets above).
function disconnectUser(userId) {
  if (io) io.in(`user:${userId}`).disconnectSockets(true);
}

module.exports = { initSockets, emit, disconnectUser };
