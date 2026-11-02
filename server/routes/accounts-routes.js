// Connects the account URLs (/api/users/...) to their controller functions and guards.

const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router();

const { requireLogin, requireRole } = require('../middleware/auth-middleware');
const rateLimit = require('../middleware/rate-limit');
const MIN = 60 * 1000;
// const loginLimit  = rateLimit({ windowMs: 15 * MIN, max: 20, message: 'Too many login attempts. Please wait 15 minutes and try again.' });
const otpLimit    = rateLimit({ windowMs: 15 * MIN, max: 10, message: 'Too many code requests. Please wait 15 minutes and try again.' });
const verifyLimit = rateLimit({ windowMs: 15 * MIN, max: 30, message: 'Too many attempts. Please wait 15 minutes and try again.' });
const lookupLimit = rateLimit({ windowMs: MIN, max: 60 });

router.get("/", requireRole('admin'), accountsController.usersGet);
router.post('/', accountsController.userCreate);
router.post('/otp/request', otpLimit, accountsController.otpRequest);
router.post('/otp/verify', verifyLimit, accountsController.otpVerify);

router.get('/locations', requireRole('admin'), accountsController.volunteerLocations);

router.get('/route', requireLogin, accountsController.route);

router.get('/postal-lookup', lookupLimit, accountsController.postalLookup);
router.get('/address-search', lookupLimit, accountsController.addressSearch);

// router.post('/login', loginLimit, accountsController.login);
router.post('/login', accountsController.login);
router.post('/logout', accountsController.logout);

router.get('/me',requireLogin, accountsController.me);
router.put('/me', requireLogin, accountsController.updateMe);
router.delete('/me', requireLogin, accountsController.removeMyShows);

module.exports = router;

