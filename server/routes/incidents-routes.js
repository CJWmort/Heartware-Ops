const express = require("express");
const incidentsController = require("../controllers/incidents-controller");
const router = express.Router();

router.get("/templates", incidentsController.listTemplates);
router.get("/", incidentsController.listIncidents);
router.post("/", incidentsController.createIncident);
router.patch("/:id/status", incidentsController.updateIncidentStatus);

module.exports = router;