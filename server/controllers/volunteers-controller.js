// F1a Registration - owner: Kuah
// Each function below is wired to a route in routes/volunteers-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// GET /api/volunteers/me
// TODO: Find Volunteer where user = req.user._id.
exports.getMyProfile = notImplemented('GET /api/volunteers/me')

// PATCH /api/volunteers/me
// TODO: Allow updating phone and availableDates only.
exports.updateMyProfile = notImplemented('PATCH /api/volunteers/me')

// GET /api/volunteers
// TODO: List volunteers (populate user name/email). Optional ?eventId= filter by availability on that date.
exports.listVolunteers = notImplemented('GET /api/volunteers')
