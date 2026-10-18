const mongoose = require('mongoose');
// This model handles one document per volunteer with their latest position ONLY
// How long a last-known position is kept after the volunteer's final update
const KEEP_SECONDS = 60 * 60 * 24; // 1 day

// Create a new 'location' schema
// One document = the latest known position of one volunteer (overwritten on every update)
const LocationsSchema = new mongoose.Schema({
  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true, // one document per volunteer
  },
  lat: {
    type: Number,
    required: true,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90'],
  },
  lng: {
    type: Number,
    required: true,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180'],
  },
  // GPS accuracy radius in metres (optional)
  accuracy: {
    type: Number,
    min: [0, 'Accuracy cannot be negative'],
  },
  // Set by the server (never trust the phone's clock). Also drives the auto-delete below.
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

// MongoDB deletes a document automatically KEEP_SECONDS after its updatedAt
LocationsSchema.index({ updatedAt: 1 }, { expireAfterSeconds: KEEP_SECONDS });

// 'location' refer to the 'locations' collection in our database
const Locations = mongoose.model('Locations', LocationsSchema, 'locations');


// ===== CREATE / UPDATE =====

// Save a volunteer's latest position: creates their document the first time,
// overwrites it afterwards. fix = { lat, lng, accuracy? }
exports.upsert = function (volunteerId, fix) {
  return Locations.findOneAndUpdate(
    { volunteer: volunteerId },
    { $set: { ...fix, updatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};