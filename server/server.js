const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const session = require("express-session");
const jwt = require("jsonwebtoken");
const MongoStore = require("connect-mongo"); // NEW: keeps logins in MongoDB instead of the server's memory
const http = require("http"); // added for sockets to work by weiming
const { initSockets } = require("./sockets"); // added for sockets to work by weiming
const ThreadState = require("./models/thread-state-model");

const server = express();
const dns = require("dns");
// make sure u add this line when you are using Express to do form (POST)
server.use(express.urlencoded({ extended: true }));

// express.json() is a middleware
server.use(express.json());

// if running locally, “http://localhost:8000/index.html”
// should load the home page of your application
// FIX: this served a "public" folder that does not exist in the project, so it was dead code. Removed; the Vue app is
// built and hosted separately (Vercel), not by Express.
// server.use("/", express.static("public"));

// Specify the path to the environment variablef file 'config.env'
dotenv.config({ path: "./config.env" });
// DNS servers used to look up the database address. Default is Google + Cloudflare (as before), because some networks'
// own DNS cannot resolve the MongoDB Atlas "mongodb+srv://" address. This now sits AFTER dotenv.config so config.env can change it:
//   DNS_SERVERS=8.8.8.8,1.1.1.1   -> use these servers (same as the default)
//   DNS_SERVERS=off               -> do not override; use the computer's / host's own DNS (for networks that block 8.8.8.8)
const dnsSetting = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1").trim();
if (dnsSetting.toLowerCase() !== "off") {
  dns.setServers(dnsSetting.split(",").map((s) => s.trim()).filter(Boolean)); // trim + drop empty entries
}
// Safety net: log unexpected errors instead of letting one stray error stop the whole server
// (which made Render return 502 until it restarted).
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", err));

// Must come AFTER dotenv.config, so NODE_ENV written in config.env is also seen
const isProduction = process.env.NODE_ENV === "production";
// Behind a host's proxy (Render, Railway...) Express must trust it, otherwise "secure" cookies are dropped
if (isProduction) server.set("trust proxy", 1);

// Allow session storage while server is running
// FIX (sockets): the session settings are kept in a variable (not inlined) so Socket.IO can reuse the SAME login
// cookie check. Before, sockets did no login check at all.
const sessionMiddleware = session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  // NEW: sessions are saved in the database, so a restart or a sleeping server no longer logs everyone out
  // (and the "MemoryStore is not designed for production" warning goes away). ttl = 8 hours, same as the cookie.
  store: MongoStore.create({ mongoUrl: process.env.DB, ttl: 8 * 60 * 60 }),
  cookie: {
    httpOnly: true, // JS can't read it
    sameSite: "lax", // fine while the browser talks to ONE origin (see client/vercel.json rewrite)
    secure: isProduction, // only send the cookie over HTTPS when deployed
    maxAge: 1000 * 60 * 60 * 8, // 8 hours
  },
});
server.use(sessionMiddleware);

// NEW: health check. Answers { ok: true } without touching the database or the login session, so it is cheap.
// Used by an uptime pinger (e.g. UptimeRobot, every 5 min) to stop Render's free server falling asleep, and
// can be set as Render's "Health Check Path". saveUninitialized is false, so a ping never creates a session row.
server.get("/api/health", (req, res) => res.json({ ok: true }));

server.get("/api/socket-token", (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ message: "Please log in." });
  const token = jwt.sign({ userId: req.session.userId, role: req.session.role }, process.env.SECRET, {
    expiresIn: 60,
  });
  res.json({ token });
});

// Routing
server.use("/api/users", require("./routes/accounts-routes"));
server.use("/api/incidents", require("./routes/incidents-routes"));
server.use("/api/schools", require("./routes/schools-routes"));
server.use("/api/badges", require("./routes/badges-routes"));
server.use("/api/assignments", require("./routes/assignments-routes"));
server.use("/api/locations", require("./routes/locations-routes"));
server.use("/api/shows", require("./routes/shows-routes"));
server.use("/api/messages", require("./routes/messages-routes"));

// async function to connect to DB
async function connectDB() {
  try {
    // connecting to Database with our config.env file and DB is constant in config.env
    await mongoose.connect(process.env.DB);
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
}

function startServer() {
  // Hosts give us PORT and need 0.0.0.0; locally keep localhost:8000
  const hostname = process.env.HOST || (isProduction ? "0.0.0.0" : "localhost");
  const port = Number(process.env.PORT) || 8000;

  const httpServer = http.createServer(server); // wrap express for sockets by weiming
  initSockets(httpServer, sessionMiddleware); // start socket.io (FIX: pass the session so it can tell who connects)

  //start the http server and listen on specific hostname and port
  // The reason for the wrapper: httpServer is now the "door" on port 8000. Normal requests like GET /api/incidents get passed to Express (server),
  // and live socket connections get passed to socket.io. Both share one port that way.
  httpServer.listen(port, hostname, () => {
    //listening for
    console.log(`Server running at http://${hostname}:${port}/`);
  });
}

// call connectDB first and when connection is ready we start the web server
connectDB().then(() => ThreadState.backfillLegacy()).then(startServer);