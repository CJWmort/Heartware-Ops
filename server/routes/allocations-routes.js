// F1b Smart Allocation - owner: Fanny
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/allocations-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.post('/run', requireAuth, requireRole('coordinator'), controller.runAllocation)
router.get('/', requireAuth, requireRole('coordinator'), controller.listAllocation)
router.get('/me', requireAuth, requireRole('volunteer'), controller.getMyAssignment)
router.patch('/slots/:slotId', requireAuth, requireRole('coordinator'), controller.reassignSlot)
router.post('/publish', requireAuth, requireRole('coordinator'), controller.publishAllocation)
router.post('/slots/:slotId/respond', requireAuth, requireRole('volunteer'), controller.respondToSlot)

module.exports = router
