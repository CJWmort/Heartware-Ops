// Login + role checks used by every protected route.
// Owner: Kuah (Feature 1a / app shell)
//
// Usage in a routes file:
//   router.get('/me', requireAuth, controller.getMe)
//   router.post('/run', requireAuth, requireRole('coordinator'), controller.run)

// TODO(Kuah): read the "Authorization: Bearer <token>" header, verify it with
// jsonwebtoken + process.env.JWT_SECRET, load the user, and put it on req.user.
// Respond 401 if the token is missing or invalid.
function requireAuth(req, res, next) {
  return res.status(501).json({ message: 'requireAuth not implemented yet' })
}

// Allows the request only if req.user.role is one of the given roles, else 403.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Please log in' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have access to this' })
    }
    next()
  }
}

module.exports = { requireAuth, requireRole }
