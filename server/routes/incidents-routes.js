const express = require("express");
const incidentsController = require("../controllers/incidents-controller");
const router = express.Router();

// FIX (security): none of these routes checked who was calling, so anyone on the internet could read every
// incident, file fake ones, or mark them resolved. Now:
//  - reporting side (templates, address lookup, create) needs a login: any logged-in user, because the volunteer
//    reports from the field
//  - coordinator side (list the queue, acknowledge / resolve) is admin only
const { requireLogin, requireRole } = require("../middleware/auth-middleware");

router.get("/templates", requireLogin, incidentsController.listTemplates);
router.get("/where", requireLogin, incidentsController.lookupAddress);
router.post("/", requireLogin, incidentsController.createIncident);
router.get("/", requireRole("admin"), incidentsController.listIncidents);
router.patch("/:id/status", requireRole("admin"), incidentsController.updateIncidentStatus);

module.exports = router;
