// F4 Incident Reporting & HQ Alerts - owner: Wei Ming
// Static paths (e.g. '/history') must come BEFORE '/:id' paths, or Express matches ':id' first.
const express = require('express')
const controller = require('../controllers/incidents-controller')
const { requireAuth, requireRole } = require('../middleware/auth')

const router = express.Router()

router.get('/templates', controller.listTemplates)
router.get('/alerts', requireAuth, requireRole('hq', 'coordinator'), controller.listAlerts)
router.patch('/alerts/:id/acknowledge', requireAuth, requireRole('hq', 'coordinator'), controller.acknowledgeAlert)
router.post('/', requireAuth, requireRole('volunteer'), controller.createIncident)
router.get('/', requireAuth, requireRole('hq', 'coordinator'), controller.listIncidents)
router.patch('/:id/status', requireAuth, requireRole('hq', 'coordinator'), controller.updateIncidentStatus)

module.exports = router
