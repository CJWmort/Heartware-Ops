const mongoose = require("mongoose"); // NEW: to check ids
const Incident = require("../models/incidents-model"); //access the database
const TEMPLATES = require("../data/incident-templates.json"); //gets the templates declared inside data

const STATUS_ORDER = { new: 0, acknowledged: 1, resolved: 2 };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const NEXT_STATUS = { new: "acknowledged", acknowledged: "resolved" };
const { emit } = require("../sockets"); // emit is declared here to use sockets
const onemap = require("../services/onemap"); // this will access onemap service for reverseGeocoding
const sendServerError = require('../utils/send-server-error')

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
    // NEW: the note is required. The form already enforces it; this stops hand-made requests with an empty note.
    const cleanNote = typeof note === "string" ? note.trim() : "";
    if (!cleanNote) {
      return res.status(400).json({ message: "Please describe the incident." });
    }
    if (cleanNote.length > 500) {
      return res.status(400).json({ message: "The description can be at most 500 characters." });
    }
    const tooLong = [school, busNo, slotId, typedAddress].some((v) => typeof v === "string" && v.length > 200);
    if (tooLong) {
      return res.status(400).json({ message: "One of the fields is too long." });
    }
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
      note: cleanNote, // CHANGED: the trimmed text (was the raw value)
      location: lat != null ? { lat, lng } : undefined,
      address: address,
      // FIX: the session stores the id as req.session.userId (see accounts-controller login). The old
      // req.session.user?._id was always undefined, so no incident ever recorded who reported it.
      volunteer: req.session.userId,
      history: [{ status: "new" }],
    });
    emit("incident:new", incident, "hq"); //new incident alert. FIX: "hq" room = admins only (was sent to every connected browser)
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
    sendServerError(res, error);
  }
};

// PATCH /api/incidents/:id/status   body: { status, note }
exports.updateIncidentStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    // FIX: a malformed id made MongoDB throw and answered 500; now it is a clear 400
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid incident id" });
    const incident = await Incident.retrieveById(req.params.id);
    if (!incident) return res.status(404).json({ message: "Incident not found" });
    if (NEXT_STATUS[incident.status] !== status)
      return res.status(400).json({ message: `Cannot go from ${incident.status} to ${status}` });
    if (status === "resolved" && !note)
      return res.status(400).json({ message: "A note is required to resolve" });

    incident.status = status;
    incident.history.push({ status, note });
    await incident.save();
    emit("incident:updated", incident, "hq"); // this will be removed from the alert. FIX: admins only, same reason
    res.json(incident);
  } catch (error) {
    sendServerError(res, error);
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
