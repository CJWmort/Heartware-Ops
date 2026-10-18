const express = require("express");
const assignmentsController = require("../controllers/assignments-controller");
const router = express.Router();

const { requireLogin, requireRole } = require("../middleware/auth-middleware");


// ===== READ =====
router.get("/", assignmentsController.getAssignments); // endpoint - get all volunteer show pairs
router.get("/me", requireLogin, assignmentsController.getMyAssignments); // endpoint - get assignments of logged in volunteer
router.get("/show/:show", assignmentsController.getShowAssignments); // endpoint - get all volunteer show pairs
router.get("/run/", assignmentsController.runAssignments); // endpoint - match volunteer to each school

// ===== UPDATE =====
router.patch("/:id/accept", requireLogin, assignmentsController.acceptMyAssignment); // endpoint - logged in volunteer accepts their assignment
router.patch("/:id/withdraw", requireLogin, assignmentsController.withdrawMyAssignment); // endpoint - logged in volunteer pulls out of an accepted assignment

// router.post("/reassign/:school", allocationsController.reassignSlots); // endpoint - find replacement volunteer for school
// router.get("/volAssignemnt/:v_id", allocationsController.getVolAssignment); // endpoint - get assignment for session volunteer (WJ)


module.exports = router;
