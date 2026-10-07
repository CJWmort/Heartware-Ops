// F4 Incident Reporting & HQ Alerts - owner: Wei Ming
// Each function below is wired to a route in routes/incidents-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
const INCIDENT_TEMPLATES = require('../data/incident-templates.json')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// GET /api/incidents/templates
// Static list - already works. Edit data/incident-templates.json to change it.
exports.listTemplates = (req, res) => res.json(INCIDENT_TEMPLATES)

// GET /api/incidents/alerts
// TODO: Overdue-checkpoint alerts. Idea: on each call (or a setInterval in sockets/index.js)
//       compare each slot's lastCheckpoint with event.checkpointSchedule; create Alert docs
//       for anything past expectedAt + graceMinutes. Emit "alert:new".
exports.listAlerts = notImplemented('GET /api/incidents/alerts')

// PATCH /api/incidents/alerts/:id/acknowledge
// TODO: Set status "acknowledged", acknowledgedBy, acknowledgedAt.
exports.acknowledgeAlert = notImplemented('PATCH /api/incidents/alerts/:id/acknowledge')

// POST /api/incidents
// TODO: Body { slotId, type, severity?, note?, photoUrl?, lat?, lng? }.
//       Save Incident with history [{ status: "new" }]. Emit "incident:new".
exports.createIncident = notImplemented('POST /api/incidents')

// GET /api/incidents
// TODO: Filter by ?status=. Sort: severity high first, then newest.
exports.listIncidents = notImplemented('GET /api/incidents')

// PATCH /api/incidents/:id/status
// TODO: Body { status, note? }. Only forward moves (new -> acknowledged -> resolved).
//       Resolving requires a note. Push to history. Emit "incident:updated".
exports.updateIncidentStatus = notImplemented('PATCH /api/incidents/:id/status')
