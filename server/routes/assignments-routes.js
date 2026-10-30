// Connects the assignment URLs (/api/assignments/...) to their controller functions and guards.

const express = require("express");
const assignmentsController = require("../controllers/assignments-controller");
const router = express.Router();

const { requireLogin, requireRole } = require("../middleware/auth-middleware");

router.get("/", requireRole("admin"), assignmentsController.getAssignments);
router.get("/me", requireLogin, assignmentsController.getMyAssignments);
router.get("/show/:show", requireRole("admin"), assignmentsController.getShowAssignments);

router.post("/run", requireRole("admin"), assignmentsController.runAssignments);
router.post("/publish", requireRole("admin"), assignmentsController.publishAssignments);

router.put("/me/stage", requireRole("volunteer"), assignmentsController.advanceMyStage);
router.delete("/me/stage", requireRole("volunteer"), assignmentsController.undoMyStage);
router.patch("/:id/accept", requireLogin, assignmentsController.acceptMyAssignment);
router.patch("/:id/decline", requireLogin, assignmentsController.declineMyAssignment);
router.patch("/:id/withdraw", requireLogin, assignmentsController.withdrawMyAssignment);

module.exports = router;
