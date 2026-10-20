const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
const session = require("express-session");
const http = require("http"); // added for sockets to work by weiming
const { initSockets } = require("./sockets"); // added for sockets to work by weiming

const server = express();
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
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
    cookie: {
      httpOnly: true, // JS can't read it
      sameSite: 'lax', // fine while the browser talks to ONE origin (see client/vercel.json rewrite)
      secure: isProduction, // only send the cookie over HTTPS when deployed
      maxAge: 1000 * 60 * 60 * 8 // 8 hours
    }
  });
server.use(sessionMiddleware);

// Routing
server.use("/api/users", require("./routes/accounts-routes"));
server.use("/api/incidents", require("./routes/incidents-routes"));
server.use("/api/schools", require("./routes/schools-routes"));
server.use("/api/badges", require("./routes/badges-routes"));
server.use("/api/assignments", require("./routes/assignments-routes"));
server.use("/api/locations", require("./routes/locations-routes"));
server.use("/api/shows", require("./routes/shows-routes"));

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
connectDB().then(startServer);
