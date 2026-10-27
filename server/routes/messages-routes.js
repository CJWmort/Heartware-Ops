const express = require("express");
const controller = require("../controllers/messages-controller");
const { requireLogin, requireRole } = require("../middleware/auth-middleware");
const router = express.Router();

router.get("/threads", requireRole("admin"), controller.listThreads); // HQ inbox list
router.get("/read-state", requireLogin, controller.getReadState); // when each side last read (for "Seen")
router.get("/unread", requireLogin, controller.getUnread); // number for the navbar badge
router.get("/", requireLogin, controller.listMessages); // any logged-in user; the controller limits what they see
router.post("/", requireLogin, controller.sendMessage);

module.exports = router;
