// F1a Registration / app shell - owner: Kuah
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/auth-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.post('/register', controller.register)
router.post('/login', controller.login)
router.get('/me', requireAuth, controller.getMe)

module.exports = router
