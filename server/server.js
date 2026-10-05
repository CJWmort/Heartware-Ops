// Entry point: loads config, connects to MongoDB, starts HTTP + Socket.IO.
const path = require('path')
const http = require('http')
const dotenv = require('dotenv')

// Load config.env BEFORE anything reads process.env
dotenv.config({ path: path.join(__dirname, 'config.env') })

const connectDB = require('./utils/db')
const app = require('./app')
const { initSockets } = require('./sockets')

const PORT = process.env.PORT || 8000

async function start() {
  await connectDB()

  const httpServer = http.createServer(app)
  initSockets(httpServer) // F4 bonus – live updates

  httpServer.listen(PORT, () => {
    console.log(`API running at http://localhost:${PORT}/api/health`)
  })
}

start()
