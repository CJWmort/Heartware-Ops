// Location endpoints: a volunteer sends their position, and the admin gets the live board.

const Locations = require('../models/locations-model');
const Assignments = require('../models/assignments-model');

const MIN_GAP_MS = 5000;
const lastSeen = new Map();

// updateMine (PUT /me) - a volunteer's phone sends its position. 1) the volunteer id comes from the
// session, never the body 2) lat/lng must be real numbers in range (400), accuracy must be >= 0 3) at
// most one update per 5 seconds per volunteer (429) 4) only volunteers with an ACCEPTED assignment are
// tracked (403) 5) overwrite their latest position in the database 6) reply { ok: true }.
exports.updateMine = async function (req, res) {
  try {
    const volunteerId = String(req.session.userId);

    const { lat, lng, accuracy } = req.body || {};
    // isNum(v) - true only for a real finite number (not NaN, not a string).
    const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

    if (!isNum(lat) || !isNum(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: 'Valid lat and lng are required.' });
    }
    if (accuracy !== undefined && (!isNum(accuracy) || accuracy < 0)) {
      return res.status(400).json({ message: 'Accuracy must be a positive number.' });
    }

    const now = Date.now();
    if (now - (lastSeen.get(volunteerId) ?? 0) < MIN_GAP_MS) {
      return res.status(429).json({ message: 'Too many updates. Please slow down.' });
    }
    lastSeen.set(volunteerId, now);

    const confirmed = await Assignments.hasConfirmed(volunteerId);
    if (!confirmed) {
      return res.status(403).json({ message: 'No confirmed assignment.' });
    }

    const fix = { lat, lng };
    if (accuracy !== undefined) fix.accuracy = accuracy;
    await Locations.upsert(volunteerId, fix);

    res.json({ ok: true });
  } catch (err) {
    console.error('updateMine failed:', err);
    res.status(500).json({ message: 'Could not save location.' });
  }
};

// shows - replies with the list of valid show names for the admin's dropdown.
exports.shows = function (req, res) {
  res.json(Assignments.SHOWS);
};

// board - Live Board data. 1) the show query must be a known show (400) 2) load accepted volunteers
// with their school and latest location 3) reply { show, serverTime, volunteers } (serverTime lets the
// browser work out "updated X min ago" without trusting its own clock).
exports.board = async function (req, res) {
  try {
    const show = String(req.query.show || '').trim();
    if (!Assignments.SHOWS.includes(show)) {
      return res.status(400).json({ message: 'Unknown show.' });
    }

    const volunteers = await Assignments.findBoard(show);

    res.json({ show, serverTime: new Date(), volunteers });
  } catch (err) {
    console.error('board failed:', err);
    res.status(500).json({ message: 'Could not load the board.' });
  }
};
