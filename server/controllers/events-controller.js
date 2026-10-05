// F1a / F1b - owner: Kuah / Fanny
// Each function below is wired to a route in routes/events-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// GET /api/events
// TODO: Return all show dates sorted by date.
exports.listEvents = notImplemented('GET /api/events')

// POST /api/events
// TODO: Create { name, date, venue, checkpointSchedule }.
exports.createEvent = notImplemented('POST /api/events')
