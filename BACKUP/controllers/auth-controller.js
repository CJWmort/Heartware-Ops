// F1a Registration / app shell - owner: Kuah
// Each function below is wired to a route in routes/auth-routes.js.
// Replace notImplemented(...) with your own async (req, res) => { ... } function.
// Endpoint contract: docs/API.md
const notImplemented = require('../utils/not-implemented')
// const { Slot, Volunteer } = require('../models')   <- import the models you need

// POST /api/auth/register
// TODO: Validate body (consent.location must be true, postalCode 6 digits).
//       Geocode postalCode ONCE with utils/onemap.js -> save Volunteer.location + address.
//       Hash password with bcryptjs, create User (role volunteer) + Volunteer.
//       Return { token, user } (sign token with jsonwebtoken + JWT_SECRET).
exports.register = notImplemented('POST /api/auth/register')

// POST /api/auth/login
// TODO: Find user by email, compare password with bcryptjs, return { token, user }.
//       Return 401 with a friendly message if wrong.
exports.login = notImplemented('POST /api/auth/login')

// GET /api/auth/me
// TODO: Return req.user (set by requireAuth).
exports.getMe = notImplemented('GET /api/auth/me')
