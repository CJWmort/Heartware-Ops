const express = require("express");
const assignmentsController = require("../controllers/assignments-controller");
const router = express.Router();

const { requireRole } = require("../middleware/auth-middleware");


// ===== READ =====
router.get("/", assignmentsController.getAssignments); // endpoint - get all volunteer show pairs
router.get("/run/", assignmentsController.runAssignments); // endpoint - match volunteer to each school
// router.post("/reassign/:school", allocationsController.reassignSlots); // endpoint - find replacement volunteer for school
// router.get("/volAssignemnt/:v_id", allocationsController.getVolAssignment); // endpoint - get assignment for session volunteer (WJ)


module.exports = router;
