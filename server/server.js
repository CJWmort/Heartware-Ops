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
server.use("/", express.static("public"));

// Specify the path to the environment variablef file 'config.env'
dotenv.config({ path: "./config.env" });

// Allow session storage while server is running
server.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // JS can't read it
      sameSite: 'lax',             
      maxAge: 1000 * 60 * 60 * 8 // 8 hours
    }
  }),
);

// Routing
server.use("/api/users", require("./routes/accounts-routes"));
server.use("/api/incidents", require("./routes/incidents-routes"));
server.use("/api/badges", require("./routes/badges-routes"));

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
  const hostname = "localhost"; // Define server hostname
  const port = 8000; // Define port number

  const httpServer = http.createServer(server); // wrap express for sockets by weiming
  initSockets(httpServer); // start socket.io

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
