const express = require('express');
const accountsController = require('../controllers/accounts-controller');
const router = express.Router(); 

const authMiddleware = require('../middleware/auth-middleware');

router.get("/users", accountsController.usersGet);

module.exports = router;


