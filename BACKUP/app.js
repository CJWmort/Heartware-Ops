// Builds the Express app (routes + middleware). server.js starts it.
// Kept separate so tests can import the app without opening a port.
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')

const { notFound, errorHandler } = require('./middleware/error-handler')

const app = express()

// ---- CORS: which websites may call this API ----
const allowedOrigins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())

app.use(
  cors({
    origin: (origin, callback) => {
      // allow tools like Postman/curl (no Origin header)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`Origin ${origin} not allowed by CORS`))
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
)

app.use(express.json({ limit: '2mb' })) // 2mb so small incident photos (base64) fit
app.use(express.urlencoded({ extended: true }))

// ---- Health check (works already) ----
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting']
  res.json({ status: 'ok', db: states[mongoose.connection.readyState] || 'unknown' })
})

// ---- Feature routes ----
app.use('/api/auth', require('./routes/auth-routes')) // F1a
app.use('/api/volunteers', require('./routes/volunteers-routes')) // F1a
app.use('/api/schools', require('./routes/schools-routes')) // F1a
app.use('/api/events', require('./routes/events-routes')) // F1a / F1b
app.use('/api/allocations', require('./routes/allocations-routes')) // F1b
app.use('/api/replacements', require('./routes/replacements-routes')) // F2
app.use('/api/tracking', require('./routes/tracking-routes')) // F3
app.use('/api/incidents', require('./routes/incidents-routes')) // F4
app.use('/api/badges', require('./routes/badges-routes')) // F5

// ---- Errors (must be last) ----
app.use(notFound)
app.use(errorHandler)

module.exports = app
