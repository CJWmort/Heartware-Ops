// F5 Recognition & Badge Studio - owner: Hanafi
// Each function below is wired to a route in routes/badges-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// GET /api/badges
// TODO: Return the badge catalogue (seeded from data/badges.json by seed-demo).
exports.listBadges = notImplemented('GET /api/badges')

// POST /api/badges/auto-award
// TODO: Body { eventId }: award FULL_ROUTE (all 6 check-ins), ON_TIME (no alerts),
//       STAND_IN_HERO (approved replacement). Skip duplicates. Return { awardedCount }.
exports.autoAward = notImplemented('POST /api/badges/auto-award')

// POST /api/badges/award
// TODO: Body { volunteerIds[], badgeId, message }. Create a BadgeAward for each.
exports.awardCustom = notImplemented('POST /api/badges/award')

// GET /api/badges/me
// TODO: My BadgeAwards with badge populated, newest first.
exports.myBadges = notImplemented('GET /api/badges/me')

// GET /api/badges/design/me
// TODO: Return my BadgeDesign, or a default (not saved) one.
exports.getMyDesign = notImplemented('GET /api/badges/design/me')

// PUT /api/badges/design/me
// TODO: Upsert my design. Refuse (409) if locked.
exports.saveMyDesign = notImplemented('PUT /api/badges/design/me')

// GET /api/badges/orders/me
// TODO: My orders, newest first.
exports.myOrders = notImplemented('GET /api/badges/orders/me')

// POST /api/badges/orders
// TODO: Body { address }. Copy design into designSnapshot, lock the design,
//       status "placed", history [{ status: "placed" }].
exports.placeOrder = notImplemented('POST /api/badges/orders')

// PATCH /api/badges/orders/:id/status
// TODO: Body { status }. Only forward moves. Push to history.
exports.updateOrderStatus = notImplemented('PATCH /api/badges/orders/:id/status')
