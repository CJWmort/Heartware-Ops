const express = require('express');
const locationsController = require('../controllers/locations-controller');
const router = express.Router();

const { requireRole } = require('../middleware/auth-middleware');

// '/api/locations/<endpoint>'

router.put('/me', requireRole('volunteer'), locationsController.updateMine); // endpoint - Volunteer sends their latest location

router.get('/shows', requireRole('admin'), locationsController.shows); // endpoint - Admin: list of shows
router.get('/board', requireRole('admin'), locationsController.board); // endpoint - Admin: volunteers + locations for a show

module.exports = router;