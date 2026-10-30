// Incident endpoints: incident types, report an incident, the admin queue, status changes and the
// address lookup.

const mongoose = require("mongoose");
const Incident = require("../models/incidents-model");
const TEMPLATES = require("../data/incident-templates.json");

const STATUS_ORDER = { new: 0, acknowledged: 1, resolved: 2 };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const NEXT_STATUS = { new: "acknowledged", acknowledged: "resolved" };
const { emit } = require("../sockets");
const onemap = require("../services/onemap");
const sendServerError = require('../utils/send-server-error')

// listTemplates - replies with the ready-made incident types from data/incident-templates.json (any
// logged-in user).
exports.listTemplates = (req, res) => res.json(TEMPLATES);

// createIncident - a volunteer files an incident. 1) read the form fields (slot, school, bus, type,
// severity, note, position and typed address), 2) the note is required (trimmed) else 400, 3) use the
// typed address, or if none and a GPS position was sent, ask OneMap for the address, 4) save the
// incident, 5) send a live "incident:new" event to HQ and reply with the saved incident.
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
      note: cleanNote,
      location: lat != null ? { lat, lng } : undefined,
      address: address,
      volunteer: req.session.userId,
      history: [{ status: "new" }],
    });
    emit("incident:new", incident, "hq");
    res.status(201).json(incident);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// listIncidents (admin) - the queue. 1) optional ?status= filter 2) load incidents (newest first) 3)
// sort by status (new, acknowledged, resolved), then severity (high, medium, low), then newest first
// 4) reply with the list.
exports.listIncidents = async (req, res) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const list = await Incident.retrieveAll(filter);
    list.sort((a, b) => {
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (byStatus !== 0) return byStatus;

      const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (bySeverity !== 0) return bySeverity;

      const byTime = new Date(b.createdAt) - new Date(a.createdAt);
      if (byTime !== 0) return byTime;
    });
    res.json(list);
  } catch (error) {
    sendServerError(res, error);
  }
};

// updateIncidentStatus (admin) - moves an incident along. 1) the id must be valid (400) 2) load it
// (404) 3) only new -> acknowledged -> resolved is allowed (400 otherwise) 4) resolving needs a note
// (400) 5) save the new status and a history entry 6) send "incident:updated" to the admins' room 7)
// reply with the incident.
exports.updateIncidentStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
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
    emit("incident:updated", incident, "hq");
    res.json(incident);
  } catch (error) {
    sendServerError(res, error);
  }
};

// lookupAddress - GPS -> address for the report form. 1) read lat and lng from the query 2) not
// numbers -> { address: null } 3) ask OneMap's reverse geocoder 4) any failure -> { address: null }
// (the form just lets the user type it).
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
