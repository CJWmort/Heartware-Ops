// The starting point of the server: sets up Express, sessions, security, the routes, Socket.IO and the
// database connection, then starts listening.

const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const MongoStore = require("connect-mongo");
const http = require("http");
const { initSockets } = require("./sockets");
const ThreadState = require("./models/thread-state-model");

const server = express();
const dns = require("dns");
server.use(express.urlencoded({ extended: true }));

server.use(express.json());

dotenv.config({ path: "./config.env" });
const dnsSetting = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1").trim();
if (dnsSetting.toLowerCase() !== "off") {
  dns.setServers(dnsSetting.split(",").map((s) => s.trim()).filter(Boolean));
}
// Safety net: log unexpected errors instead of letting one stray error stop the whole server (which
// made Render return 502 until it restarted).
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));
// unhandledRejection - log any promise error nobody caught instead of letting the server crash
// silently.
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

const isProduction = process.env.NODE_ENV === "production";
if (isProduction) server.set("trust proxy", 1);

const sessionMiddleware = session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.DB, ttl: 8 * 60 * 60 }),
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 8,
  },
});
// health check. Answers { ok: true } without touching the database or the login session, so it is
// cheap. Used by an uptime pinger (e.g. UptimeRobot, every 5 min) to stop Render's free server falling
// asleep, and can be set as Render's "Health Check Path". saveUninitialized is false, so a ping never
// creates a session row. GET /api/health - "are you awake?" check. 1. Does not touch the database or
// the session, so it is very cheap. 2. Replies { ok: true }. An uptime pinger calls it so Render's
// free server does not fall asleep.
server.get("/api/health", (req, res) => res.json({ ok: true }));

server.use(sessionMiddleware);

// GET /api/socket-token - gives the browser a short-lived pass for the live (Socket.IO) connection. 1.
// If the caller has no login session -> reply 401 "Please log in.". 2. Otherwise sign a small token
// (JWT) containing their userId and role, valid for only 60 seconds. 3. Send the token back; the
// client uses it right away when opening the socket.
server.get("/api/socket-token", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ message: "Please log in." });
  const token = jwt.sign({ userId: req.session.userId, role: req.session.role }, process.env.SECRET, {
    expiresIn: 60,
  });
  res.json({ token });
});

server.use("/api/users", require("./routes/accounts-routes"));
server.use("/api/incidents", require("./routes/incidents-routes"));
server.use("/api/schools", require("./routes/schools-routes"));
server.use("/api/badges", require("./routes/badges-routes"));
server.use("/api/assignments", require("./routes/assignments-routes"));
server.use("/api/locations", require("./routes/locations-routes"));
server.use("/api/shows", require("./routes/shows-routes"));
server.use("/api/messages", require("./routes/messages-routes"));

// connectDB() - connects to MongoDB. 1. Wait for mongoose.connect() using the DB address from
// config.env. 2. Success: print "MongoDB connected successfully". 3. Failure: print the error and stop
// the whole program (process.exit(1)), because the API is useless without a database.
async function connectDB() {
  try {
    await mongoose.connect(process.env.DB);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

// startServer() - starts listening for web traffic. 1. Choose the host: HOST from config.env, else
// 0.0.0.0 on a deployed host, else localhost. 2. Choose the port: PORT from config.env, else 8000. 3.
// Wrap the Express app in a plain Node HTTP server so normal API requests AND live sockets share one
// port. 4. Start Socket.IO on that HTTP server (initSockets), giving it the session checker. 5. Start
// listening and print the address.
function startServer() {
  const hostname = process.env.HOST || (isProduction ? "0.0.0.0" : "localhost");
  const port = Number(process.env.PORT) || 8000;

  const httpServer = http.createServer(server);
  initSockets(httpServer, sessionMiddleware);

  httpServer.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}

connectDB().then(() => ThreadState.backfillLegacy()).then(startServer);