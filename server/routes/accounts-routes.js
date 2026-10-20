const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router();

const { requireLogin, requireRole } = require('../middleware/auth-middleware');
// NEW (security): limits on the endpoints anyone can call without logging in. See middleware/rate-limit.js for the idea.
const rateLimit = require('../middleware/rate-limit');
const MIN = 60 * 1000;
const loginLimit  = rateLimit({ windowMs: 15 * MIN, max: 20, message: 'Too many login attempts. Please wait 15 minutes and try again.' }); // stops password guessing
const otpLimit    = rateLimit({ windowMs: 15 * MIN, max: 10, message: 'Too many code requests. Please wait 15 minutes and try again.' }); // stops us emailing strangers over and over
const verifyLimit = rateLimit({ windowMs: 15 * MIN, max: 30, message: 'Too many attempts. Please wait 15 minutes and try again.' }); // stops guessing the 6-digit code
const lookupLimit = rateLimit({ windowMs: MIN, max: 60 }); // OneMap lookups: generous for a debounced form, but protects our OneMap quota

// '/api/users/<endpoint>'

router.get("/", requireRole('admin'), accountsController.usersGet); // endpoint - Fetch all users
router.post('/', accountsController.userCreate); // endpoint - Create new volunteers
router.post('/otp/request', otpLimit, accountsController.otpRequest); // endpoint - Email a 6-digit code (registration)
router.post('/otp/verify', verifyLimit, accountsController.otpVerify); // endpoint - Check the 6-digit code

router.get('/locations', requireRole('admin'), accountsController.volunteerLocations); // endpoint - Fetch all volunteers Geolocations (lat, lng)

router.get('/route', requireLogin, accountsController.route); // endpoint - Fetch route calculated by OneMap (start, end)

router.get('/postal-lookup', lookupLimit, accountsController.postalLookup); // endpoint - Postal code -> address (registration form)
router.get('/address-search', lookupLimit, accountsController.addressSearch); // endpoint - Address text -> matching places (registration form)

router.post('/login', loginLimit, accountsController.login); // endpoint - Start user session (backend)
router.post('/logout', accountsController.logout); // endpoint - Stop user session (backend)

router.get('/me',requireLogin, accountsController.me); // endpoint - Fetch current logged in user
router.put('/me', requireLogin, accountsController.updateMe); // endpoint - Update current logged in user's available shows
router.delete('/me', requireLogin, accountsController.removeMyShows); // endpoint - Remove shows from current logged in user's available shows

module.exports = router;


