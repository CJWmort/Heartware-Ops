// F1a Registration - owner: Kuah
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/schools-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/', requireAuth, controller.listSchools)
router.get('/:id', requireAuth, controller.getSchool)

module.exports = router
