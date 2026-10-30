// The live location database model (one latest position per volunteer).

const mongoose = require('mongoose');
const KEEP_SECONDS = 60 * 60 * 24;

const LocationsSchema = new mongoose.Schema({
  volunteer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
    unique: true,
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
  accuracy: {
    type: Number,
    min: [0, 'Accuracy cannot be negative'],
  },
  updatedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
});

LocationsSchema.index({ updatedAt: 1 }, { expireAfterSeconds: KEEP_SECONDS });

const Locations = mongoose.model('Locations', LocationsSchema, 'locations');

// upsert(volunteerId, fix) - saves the latest position: 1) find this volunteer's document 2) $set the
// new lat/lng/accuracy and updatedAt = now 3) upsert = create it the first time 4) validators run.
exports.upsert = function (volunteerId, fix) {
  return Locations.findOneAndUpdate(
    { volunteer: volunteerId },
    { $set: { ...fix, updatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
};