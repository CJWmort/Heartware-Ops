// Starts Socket.IO, checks the login session on connect, puts users into rooms and gives the rest of
// the server an emit() to send live events.

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { registerChat } = require("./chat");

let io = null;

// initSockets(httpServer, sessionMiddleware) - starts live updates (Socket.IO). Steps: 1. Build the
// list of allowed browser origins from CLIENT_ORIGINS (trimmed). 2. Create the Socket.IO server on the
// HTTP server (cookies allowed). 3. On the first request of each connection ("handshake", no sid yet)
// run the same session middleware as Express, so the login cookie identifies the user. 4. Refuse the
// connection unless the session has a userId, or a valid short-lived token from /api/socket-token is
// supplied. 5. On connect: admins join room "hq", everyone joins their private room "user:<id>", then
// the chat handlers are registered.
function initSockets(httpServer, sessionMiddleware) {
  const origins = (process.env.CLIENT_ORIGINS || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim());
  io = new Server(httpServer, { addTrailingSlash: false, cors: { origin: origins, credentials: true } });

  if (sessionMiddleware) {
    // session middleware for sockets - run the login session check only on the first handshake of a
    // connection, not on later polling requests.
    io.engine.use((req, res, next) => {
      const isHandshake = req._query.sid === undefined;
      if (isHandshake) sessionMiddleware(req, res, next);
      else next();
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

  // connection - a user connected: admins join the "hq" room, everyone joins their own room, the chat
  // handlers are registered and the disconnect is logged.
  io.on("connection", (socket) => {
    const { userId, role } = socket.request.session;
    console.log("socket connected", socket.id, role);

    if (role === "admin") socket.join("hq");
    socket.join(`user:${userId}`);

    registerChat(io, socket);

    // disconnect - log that this socket left.
    socket.on("disconnect", () => console.log("socket disconnected", socket.id));
  });

  return io;
}

// emit(eventName, payload, room) - broadcast helper used by the controllers. 1) sockets not running
// (tests) -> do nothing 2) a room given -> send only to that room 3) otherwise send to everybody.
function emit(eventName, payload, room) {
  if (!io) return;
  if (room) io.to(room).emit(eventName, payload);
  else io.emit(eventName, payload);
}

// disconnectUser(userId) - on logout: disconnect every open socket in that user's private room.
function disconnectUser(userId) {
  if (io) io.in(`user:${userId}`).disconnectSockets(true);
}

module.exports = { initSockets, emit, disconnectUser };
