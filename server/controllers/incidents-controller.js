const Incident = require("../models/incidents-model");
const TEMPLATES = require("../data/incident-templates.json");

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const NEXT_STATUS = { new: "acknowledged", acknowledged: "resolved" };

// GET /api/incidents/templates
exports.listTemplates = (req, res) => res.json(TEMPLATES);

// POST /api/incidents
exports.createIncident = async (req, res) => {
  try {
    const { slotId, type, severity, note, lat, lng } = req.body;
    const incident = await Incident.create({
      slotId,
      type,
      severity,
      note,
      location: lat != null ? { lat, lng } : undefined,
      reporter: req.session.user?._id,
      history: [{ status: "new" }],
    });
    res.status(201).json(incident);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/incidents?status=new
exports.listIncidents = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const list = await Incident.retrieveAll(filter);
    list.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/incidents/:id/status   body: { status, note }
exports.updateIncidentStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    const incident = await Incident.retrieveById(req.params.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });
    if (NEXT_STATUS[incident.status] !== status)
      return res.status(400).json({ message: `Cannot go from ${incident.status} to ${status}` });
    if (status === "resolved" && !note)
      return res.status(400).json({ message: "A note is required to resolve" });

    incident.status = status;
    incident.history.push({ status, note });
    await incident.save();
    res.json(incident);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
