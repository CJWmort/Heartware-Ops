const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router(); 

const { requireLogin, requireRole } = require('../middleware/auth-middleware');

router.get("/users", requireRole('admin'), accountsController.usersGet); // endpoint - Fetch all users
router.post('/users', accountsController.userCreate); // endpoint - Create new users

router.post('/login', accountsController.login);
router.post('/logout', accountsController.logout);
router.get('/me', requireLogin, accountsController.me);


module.exports = router;


