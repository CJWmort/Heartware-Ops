// F1a Registration - owner: Kuah
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/volunteers-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/me', requireAuth, requireRole('volunteer'), controller.getMyProfile)
router.patch('/me', requireAuth, requireRole('volunteer'), controller.updateMyProfile)
router.get('/', requireAuth, requireRole('coordinator'), controller.listVolunteers)

module.exports = router
