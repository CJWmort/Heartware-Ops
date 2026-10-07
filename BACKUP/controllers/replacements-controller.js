// F2 Open Slot Replacement - owner: Yap
// Each function below is wired to a route in routes/replacements-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// POST /api/replacements/drop-out
// TODO: Volunteer gives up their slot: slot.status = "vacant", create Replacement (status open,
//       expiresAt for the countdown). Do NOT touch any other slot. AuditLog "DROP_OUT".
exports.dropOut = notImplemented('POST /api/replacements/drop-out')

// POST /api/replacements/no-show
// TODO: Same as dropOut but done by a coordinator with reason "No-show".
exports.markNoShow = notImplemented('POST /api/replacements/no-show')

// GET /api/replacements/open
// TODO: Coordinators: all open replacements.
//       Volunteers: only ones they are free for (date) and reasonably near (distance).
exports.listOpen = notImplemented('GET /api/replacements/open')

// GET /api/replacements/history
// TODO: AuditLog entries for ?eventId=, newest first.
exports.history = notImplemented('GET /api/replacements/history')

// POST /api/replacements/swaps
// TODO: Create a Swap request between my slot and another slot.
exports.requestSwap = notImplemented('POST /api/replacements/swaps')

// PATCH /api/replacements/swaps/:id
// TODO: Approve -> exchange the two slots' volunteers. Reject -> just mark it.
exports.decideSwap = notImplemented('PATCH /api/replacements/swaps/:id')

// POST /api/replacements/:id/claim
// TODO: Add the volunteer to replacement.claims (no duplicates; reject if not open).
exports.claim = notImplemented('POST /api/replacements/:id/claim')

// GET /api/replacements/:id/candidates
// TODO: Available volunteers within ?radiusKm= of the school, sorted by distance,
//       marking who has claimed. Feeds the radius-slider map.
exports.listCandidates = notImplemented('GET /api/replacements/:id/candidates')

// POST /api/replacements/:id/approve
// TODO: Body { volunteerId }. Fill the slot with that volunteer (status "published"),
//       replacement.status = "filled". AuditLog "APPROVE".
exports.approve = notImplemented('POST /api/replacements/:id/approve')
