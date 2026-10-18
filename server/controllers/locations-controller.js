const Locations = require('../models/locations-model');
const Assignments = require('../models/assignments-model');

// Minimum gap between two updates from the same volunteer (stops spam / buggy clients)
const MIN_GAP_MS = 5000; // 5 Seconds
const lastSeen = new Map(); // volunteerId -> time of their last accepted request

// endpoint - PUT /api/locations/me
// A volunteer sends their latest position: { lat, lng, accuracy? }
exports.updateMine = async function (req, res) {
  try {
    // Identity comes from the login session, never from the request body
    const volunteerId = String(req.session.userId);

    // Validate the body: lat and lng must be real numbers
    const { lat, lng, accuracy } = req.body || {};
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

    if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'Valid lat and lng are required.' });
    }
    if (accuracy !== undefined && (!isNum(accuracy) || accuracy < 0)) {
      return res.status(400).json({ message: 'Accuracy must be a positive number.' });
    }

    // Rate limit per volunteer
    const now = Date.now();
    if (now - (lastSeen.get(volunteerId) ?? 0) < MIN_GAP_MS) {
      return res.status(429).json({ message: 'Too many updates. Please slow down.' });
    }
    lastSeen.set(volunteerId, now);

    // Only volunteers with a confirmed assignment are tracked
    const confirmed = await Assignments.hasConfirmed(volunteerId);
    if (!confirmed) {
      return res.status(403).json({ message: 'No confirmed assignment.' });
    }

    // Save (overwrite) the volunteer's latest position
    const fix = { lat, lng };
    if (accuracy !== undefined) fix.accuracy = accuracy;
    await Locations.upsert(volunteerId, fix);

    res.json({ ok: true });
  } catch (err) {
    console.error('updateMine failed:', err);
    res.status(500).json({ message: 'Could not save location.' });
  }
};

// endpoint - GET /api/locations/shows
// The list of shows for the admin's filter dropdown
exports.shows = function (req, res) {
  res.json(Assignments.SHOWS);
};

// endpoint - GET /api/locations/board?show=NE Show 1
// Confirmed volunteers of a show with their latest location, for the Live Board
exports.board = async function (req, res) {
  try {
    const show = String(req.query.show || '').trim();
    if (!Assignments.SHOWS.includes(show)) {
      return res.status(400).json({ message: 'Unknown show.' });
    }

    const volunteers = await Assignments.findBoard(show);

    // serverTime lets the browser work out "updated X min ago" without trusting its own clock
    res.json({ show, serverTime: new Date(), volunteers });
  } catch (err) {
    console.error('board failed:', err);
    res.status(500).json({ message: 'Could not load the board.' });
  }
};