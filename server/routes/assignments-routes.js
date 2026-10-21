const express = require("express");
const assignmentsController = require("../controllers/assignments-controller");
const router = express.Router();

const { requireLogin, requireRole } = require("../middleware/auth-middleware");


// ===== READ =====
// FIX (security): these two used to be public and returned every volunteer's details, so they are admin only now.
router.get("/", requireRole("admin"), assignmentsController.getAssignments); // endpoint - get all volunteer show pairs (admin only)
router.get("/me", requireLogin, assignmentsController.getMyAssignments); // endpoint - get assignments of logged in volunteer
router.get("/show/:show", requireRole("admin"), assignmentsController.getShowAssignments); // endpoint - get all volunteer show pairs (admin only)

// ===== CREATE =====
// POST not GET: running replaces the existing allocation, so it must never fire from a link or a browser preload.
router.post("/run", requireRole("admin"), assignmentsController.runAssignments); // endpoint - match volunteer to each school (admin only)
// NEW: release the draft allocation to volunteers (body: { show?: "NE Show 1" }, omit show = all shows)
router.post("/publish", requireRole("admin"), assignmentsController.publishAssignments); // endpoint - publish draft assignments (admin only)

// ===== UPDATE =====
router.patch("/:id/accept", requireLogin, assignmentsController.acceptMyAssignment); // endpoint - logged in volunteer accepts their assignment
// NEW: the spec says volunteers "accept or decline"; only accept and withdraw existed before.
router.patch("/:id/decline", requireLogin, assignmentsController.declineMyAssignment); // endpoint - logged in volunteer declines a pending assignment
router.patch("/:id/withdraw", requireLogin, assignmentsController.withdrawMyAssignment); // endpoint - logged in volunteer pulls out of an accepted assignment
// NOTE: there is no Undo endpoint. The team decided a Declined / Withdrawn answer is final (the Undo code was removed).

// router.get("/volAssignemnt/:v_id", allocationsController.getVolAssignment); // endpoint - get assignment for session volunteer (WJ)


module.exports = router;
