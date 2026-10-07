const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router(); 

const authMiddleware = require('../middleware/auth-middleware');

router.get("/users", accountsController.usersGet); // endpoint - Fetch all users
router.post('/users', accountsController.userCreate); // endpoint - Create new users

module.exports = router;


