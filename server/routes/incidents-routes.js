// Connects the incident URLs (/api/incidents/...) to their controller functions and guards.

const express = require("express");
const incidentsController = require("../controllers/incidents-controller");
const router = express.Router();

const { requireLogin, requireRole } = require("../middleware/auth-middleware");

router.get("/templates", requireLogin, incidentsController.listTemplates);
router.get("/where", requireLogin, incidentsController.lookupAddress);
router.post("/", requireLogin, incidentsController.createIncident);
router.get("/", requireRole("admin"), incidentsController.listIncidents);
router.patch("/:id/status", requireRole("admin"), incidentsController.updateIncidentStatus);

module.exports = router;
