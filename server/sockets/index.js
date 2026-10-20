// Socket.IO live updates – BONUS feature. Owner: Wei Ming (F4)
// Docs: https://socket.io/docs/v4/
//
// Server → client events we agreed on (see docs/API.md):
//   incident:new, incident:updated, alert:new, tracking:update
//
// From any controller you can broadcast with:
//   const { emit } = require('../sockets')
//   emit('incident:new', incident)

const { Server } = require("socket.io");

let io = null;

function initSockets(httpServer, sessionMiddleware) {
  const origins = (process.env.CLIENT_ORIGINS || "http://localhost:5173").split(",");
  // FIX: credentials: true lets the browser send the login cookie with the socket handshake
  // (the old TODO planned a JWT, but this app uses cookie sessions, so the cookie is the proof of login).
  io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  // FIX (security): before, anyone could open a socket and receive every incident as it was reported.
  // Run the normal express-session middleware on the socket handshake so socket.request.session is filled in.
  if (sessionMiddleware) io.engine.use(sessionMiddleware);

  // Refuse anyone who is not logged in (no userId in the session) before the connection is accepted.
  io.use((socket, next) => {
    const session = socket.request.session;
    if (!session || !session.userId) return next(new Error("Please log in."));
    next();
  });

  io.on("connection", (socket) => {
    const { userId, role } = socket.request.session;
    console.log("socket connected", socket.id, role);

    // Admins (coordinators at HQ) join the "hq" room. Incident events are sent to this room only,
    // so a volunteer's browser never receives other people's incident reports.
    if (role === "admin") socket.join("hq");
    socket.join(`user:${userId}`); // private room, for messages meant for one person

    socket.on("disconnect", () => console.log("socket disconnected", socket.id));
  });

  // TODO(Wei Ming): optional – run the overdue-checkpoint check every minute here
  // with setInterval(...) and emit('alert:new', alert, 'hq') for each new alert.

  return io;
}

// Safe to call even if sockets are not running (e.g. in tests).
function emit(eventName, payload, room) {
  if (!io) return;
  if (room) io.to(room).emit(eventName, payload);
  else io.emit(eventName, payload);
}

module.exports = { initSockets, emit };
