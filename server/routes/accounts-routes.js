const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router();

const { requireLogin, requireRole } = require('../middleware/auth-middleware');

// '/api/users/<endpoint>'

router.get("/", requireRole('admin'), accountsController.usersGet); // endpoint - Fetch all users
router.post('/', accountsController.userCreate); // endpoint - Create new volunteers
router.post('/otp/request', accountsController.otpRequest); // endpoint - Email a 6-digit code (registration)
router.post('/otp/verify', accountsController.otpVerify); // endpoint - Check the 6-digit code

router.get('/locations', requireRole('admin'), accountsController.volunteerLocations); // endpoint - Fetch all volunteers Geolocations (lat, lng)

router.get('/route', requireLogin, accountsController.route); // endpoint - Fetch route calculated by OneMap (start, end)

router.get('/postal-lookup', accountsController.postalLookup); // endpoint - Postal code -> address (registration form)
router.get('/address-search', accountsController.addressSearch); // endpoint - Address text -> matching places (registration form)

router.post('/login', accountsController.login); // endpoint - Start user session (backend)
router.post('/logout', accountsController.logout); // endpoint - Stop user session (backend)

router.get('/me',requireLogin, accountsController.me); // endpoint - Fetch current logged in user


module.exports = router;


