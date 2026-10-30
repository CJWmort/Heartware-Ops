// Connects the location URLs (/api/locations/...) to their controller functions and guards.

const express = require('express');
const locationsController = require('../controllers/locations-controller');
const router = express.Router();

const { requireRole } = require('../middleware/auth-middleware');

router.put('/me', requireRole('volunteer'), locationsController.updateMine);

router.get('/shows', requireRole('admin'), locationsController.shows);
router.get('/board', requireRole('admin'), locationsController.board);

module.exports = router;