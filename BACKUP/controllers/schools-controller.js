// F1a Registration - owner: Kuah
// Each function below is wired to a route in routes/schools-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// GET /api/schools
// TODO: Return schools, optional ?q= name search. Data comes from scripts/seed-schools.js.
exports.listSchools = notImplemented('GET /api/schools')

// GET /api/schools/:id
// TODO: Return one school or 404.
exports.getSchool = notImplemented('GET /api/schools/:id')
