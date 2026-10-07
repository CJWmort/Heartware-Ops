// F5 Recognition & Badge Studio - owner: Hanafi
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/badges-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, controller.listBadges)
router.post('/auto-award', requireAuth, requireRole('coordinator'), controller.autoAward)
router.post('/award', requireAuth, requireRole('coordinator'), controller.awardCustom)
router.get('/me', requireAuth, requireRole('volunteer'), controller.myBadges)
router.get('/design/me', requireAuth, requireRole('volunteer'), controller.getMyDesign)
router.put('/design/me', requireAuth, requireRole('volunteer'), controller.saveMyDesign)
router.get('/orders/me', requireAuth, requireRole('volunteer'), controller.myOrders)
router.post('/orders', requireAuth, requireRole('volunteer'), controller.placeOrder)
router.patch('/orders/:id/status', requireAuth, requireRole('coordinator'), controller.updateOrderStatus)

module.exports = router
