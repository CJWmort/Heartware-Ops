const Incident = require("../models/incidents-model"); //access the database
const TEMPLATES = require("../data/incident-templates.json"); //gets the templates declared inside data

const STATUS_ORDER = { new: 0, acknowledged: 1, resolved: 2 };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const NEXT_STATUS = { new: "acknowledged", acknowledged: "resolved" };
const { emit } = require("../sockets"); // emit is declared here to use sockets
const onemap = require("../../client/src/services/onemap"); // this will access onemap service for reverseGeocoding

// GET /api/incidents/templates
exports.listTemplates = (req, res) => res.json(TEMPLATES);

// POST /api/incidents
exports.createIncident = async (req, res) => {
  try {
    const {
      slotId,
      school,
      busNo,
      type,
      severity,
      note,
      lat,
      lng,
      address: typedAddress,
    } = req.body;
    // handle address retreival using geocoding by onemap
    let address = typedAddress?.trim() || null;
    try {
      if (!address && lat != null && lng != null) {
        address = await onemap.reverseGeocode(lat, lng);
      }
    } catch (error) {
      console.error(error);
    }

    const incident = await Incident.create({
      slotId,
      school,
      busNo,
      type,
      severity,
      note,
      location: lat != null ? { lat, lng } : undefined,
      address: address,
      volunteer: req.session.user?._id,
      history: [{ status: "new" }],
    });
    emit("incident:new", incident); //new incident alert
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
    list.sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;

      const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (bySeverity !== 0) return bySeverity;

      const byTime = new Date(b.createdAt) - new Date(a.createdAt); //newest incident will be at the top
      if (byTime !== 0) return byTime;
    });
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
    emit("incident:updated", incident); // this will be removed from the alert
    res.json(incident);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Lookup address for volunteer's incident report page
exports.lookupAddress = async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return res.json({ address: null });

  try {
    const address = await onemap.reverseGeocode(lat, lng);
    res.json({ address });
  } catch (error) {
    res.json({ address: null });
  }
};
