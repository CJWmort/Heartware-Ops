// F1a / F1b - owner: Kuah / Fanny
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/events-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, controller.listEvents)
router.post('/', requireAuth, requireRole('coordinator'), controller.createEvent)

module.exports = router
