const express = require("express");
const badgesController = require("../controllers/badges-controller");
const router = express.Router();

const { requireLogin } = require('../middleware/auth-middleware');   
router.get("/", requireLogin, badgesController.listBadges);
router.get("/me", requireLogin, badgesController.listMyAwards);

module.exports = router;