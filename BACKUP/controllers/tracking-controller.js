// F3 Live Movement Tracking - owner: Chin
// Each function below is wired to a route in routes/tracking-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
const { CHECKPOINTS } = require('../utils/constants')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// GET /api/tracking/checkpoints
// Static list - already works.
exports.listCheckpoints = (req, res) => res.json(CHECKPOINTS)

// POST /api/tracking/check-ins
// TODO: Body { slotId, checkpoint, lat, lng }. Reject skipping checkpoints (must be the next one
//       in CHECKPOINTS order). Save CheckIn, update slot.lastCheckpoint.
//       Bonus hook: emit "tracking:update" via sockets/index.js.
exports.checkIn = notImplemented('POST /api/tracking/check-ins')

// POST /api/tracking/pings
// TODO: Body { slotId, lat, lng, accuracy }. Save LocationPing, update slot.lastLocationAt. Return 204.
exports.ping = notImplemented('POST /api/tracking/pings')

// GET /api/tracking/live
// TODO: For ?eventId=: every slot with school, volunteer, lastCheckpoint and its latest ping.
exports.liveBoard = notImplemented('GET /api/tracking/live')

// GET /api/tracking/groups/:slotId/timeline
// TODO: All check-ins + pings for one slot, oldest first.
exports.groupTimeline = notImplemented('GET /api/tracking/groups/:slotId/timeline')
