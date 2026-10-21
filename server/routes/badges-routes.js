const express = require("express");
const badgesController = require("../controllers/badges-controller");
const router = express.Router();

const { requireLogin, requireRole } = require('../middleware/auth-middleware');   
router.get("/", requireLogin, badgesController.listBadges);
router.get("/me", requireLogin, badgesController.listMyAwards);
router.post("/award", requireRole('admin'), badgesController.awardBadge);
router.put("/design/me", requireRole('volunteer'), badgesController.saveMyDesign);
router.post("/orders", requireRole('volunteer'), badgesController.placeOrder);
router.get("/design/me", requireRole('volunteer'), badgesController.getMyDesign);
router.get("/orders/me", requireRole('volunteer'), badgesController.listMyOrders);

module.exports = router;