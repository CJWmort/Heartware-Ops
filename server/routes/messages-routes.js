// Connects the chat URLs (/api/messages/...) to their controller functions and guards.

const express = require("express");
const controller = require("../controllers/messages-controller");
const { requireLogin, requireRole } = require("../middleware/auth-middleware");
const router = express.Router();

router.get("/threads", requireRole("admin"), controller.listThreads);
router.get("/read-state", requireLogin, controller.getReadState);
router.get("/unread", requireLogin, controller.getUnread);
router.get("/", requireLogin, controller.listMessages);
router.post("/", requireLogin, controller.sendMessage);

module.exports = router;
