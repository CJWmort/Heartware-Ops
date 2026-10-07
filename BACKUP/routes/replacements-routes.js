// F2 Open Slot Replacement - owner: Yap
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/replacements-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.post('/drop-out', requireAuth, requireRole('volunteer'), controller.dropOut)
router.post('/no-show', requireAuth, requireRole('coordinator'), controller.markNoShow)
router.get('/open', requireAuth, controller.listOpen)
router.get('/history', requireAuth, requireRole('coordinator'), controller.history)
router.post('/swaps', requireAuth, requireRole('volunteer'), controller.requestSwap)
router.patch('/swaps/:id', requireAuth, requireRole('coordinator'), controller.decideSwap)
router.post('/:id/claim', requireAuth, requireRole('volunteer'), controller.claim)
router.get('/:id/candidates', requireAuth, requireRole('coordinator'), controller.listCandidates)
router.post('/:id/approve', requireAuth, requireRole('coordinator'), controller.approve)

module.exports = router
