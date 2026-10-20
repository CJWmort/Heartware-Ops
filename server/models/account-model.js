const mongoose = require("mongoose");

// Create a new 'account' schema
const AccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{6}$/, "Please enter a valid 6-digit Singapore postal code"],
    },
    address: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^[689]\d{7}$/, "Please enter a valid 8-digit Singapore phone number"],
    },
    role: {
      type: String,
      required: true,
      // FIX: any text could be saved as a role. Only the two roles the app understands are allowed now.
      enum: { values: ["volunteer", "admin"], message: "Role must be volunteer or admin" },
    },
    password: {
      type: String,
      required: true,
    },
    availableShows: {
      type: [String],
      default: [],
    },
    // NEW: when the volunteer ticked the location-sharing consent box at sign up (not required, so old accounts still load)
    locationConsentAt: {
      type: Date,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true, // auto timestamp management (createdAt, updatedAt) will update automatically based on methods used
  },
);
// 'account' refer to the 'accounts' collection in our database
const Account = mongoose.model("Account", AccountSchema, "accounts");

// CRUD Methods for Accounts Schema

exports.retrieveAll = function () {
  return Account.find().select("-password"); // ".select('-password')" hides password field
};

exports.create = function (data) {
  return new Account(data).save();
};

exports.findByEmail = function (email) {
  return Account.findOne({ email: email.toLowerCase().trim() });
};

exports.findById = function (id) {
  return Account.findById(id).select("-password");
};

// Fetch all volunteers (name, postalCode)
exports.retrieveVolunteers = function () {
  return Account.find({ role: "volunteer" }).select("name postalCode address lat lng");
};

// Update the shows a volunteer is available for
exports.updateAvailableShows = function (id, availableShows) {
  return Account.findByIdAndUpdate(
    id,
    { availableShows },
    { new: true, runValidators: true }, // return the updated doc
  ).select("-password");
};

// Remove the given shows from a volunteer's available shows
exports.removeAvailableShows = function (id, shows) {
  return Account.findByIdAndUpdate(
    id,
    { $pull: { availableShows: { $in: shows } } },
    { new: true }, // return the updated doc
  ).select("-password");
};
// in account-model.js
exports.findVolunteersByShow = function (show) {
  return Account.find({ role: "volunteer", availableShows: show.trim() });
};

// Used by registration to stop the same phone number signing up twice
exports.findByPhone = function (phone) {
  return Account.findOne({ phone: String(phone).replace(/\s+/g, "") });
};
