// F1b Smart Allocation - owner: Fanny
// Each function below is wired to a route in routes/allocations-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// POST /api/allocations/run
// TODO: Scarcity-first algorithm (your core logic):
//       - create one Slot per P5 class per school for the event
//       - only volunteers available on the event date
//       - fill schools with the FEWEST nearby volunteers first (use utils/haversine.js)
//       - set slot.status = "proposed", save distanceKm
//       Return { slots, summary }.
exports.runAllocation = notImplemented('POST /api/allocations/run')

// GET /api/allocations
// TODO: Return slots for ?eventId= with school + volunteer populated.
exports.listAllocation = notImplemented('GET /api/allocations')

// GET /api/allocations/me
// TODO: Return the logged-in volunteer's published slot(s), with school + event populated.
exports.getMyAssignment = notImplemented('GET /api/allocations/me')

// PATCH /api/allocations/slots/:slotId
// TODO: Manual drag-and-drop override. Return { slot, warnings[] }
//       (e.g. "far away", "not available that date", "already in another slot"). Write an AuditLog entry.
exports.reassignSlot = notImplemented('PATCH /api/allocations/slots/:slotId')

// POST /api/allocations/publish
// TODO: Set proposed slots to "published" for the event; set event.status.
exports.publishAllocation = notImplemented('POST /api/allocations/publish')

// POST /api/allocations/slots/:slotId/respond
// TODO: Body { response: "accepted" | "declined" }. Only the slot's own volunteer may respond.
exports.respondToSlot = notImplemented('POST /api/allocations/slots/:slotId/respond')
