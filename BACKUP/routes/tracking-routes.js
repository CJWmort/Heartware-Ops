// F3 Live Movement Tracking - owner: Chin
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/tracking-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/checkpoints', controller.listCheckpoints)
router.post('/check-ins', requireAuth, requireRole('volunteer'), controller.checkIn)
router.post('/pings', requireAuth, requireRole('volunteer'), controller.ping)
router.get('/live', requireAuth, requireRole('hq', 'coordinator'), controller.liveBoard)
router.get('/groups/:slotId/timeline', requireAuth, requireRole('hq', 'coordinator'), controller.groupTimeline)

module.exports = router
