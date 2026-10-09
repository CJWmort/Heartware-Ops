const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router();

const { requireLogin, requireRole } = require('../middleware/auth-middleware');

// '/api/users/<endpoint>'

router.get("/", requireRole('admin'), accountsController.usersGet); // endpoint - Fetch all users
router.post('/', accountsController.userCreate); // endpoint - Create new volunteers

router.get('/locations', requireRole('admin'), accountsController.volunteerLocations); // endpoint - Fetch all volunteers Geolocations (lat, lng)

router.post('/login', accountsController.login); // endpoint - Start user session (backend)
router.post('/logout', accountsController.logout); // endpoint - Stop user session (backend)

router.get('/me',requireLogin, accountsController.me); // endpoint - Fetch current logged in user


module.exports = router;


