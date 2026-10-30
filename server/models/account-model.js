// The Account database model (volunteers and admins) and its query helpers.

const mongoose = require("mongoose");

const AccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
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
    withdrawnShows: {
      type: [
        {
          _id: false,
          showId: { type: mongoose.Schema.Types.ObjectId, ref: "Shows" },
          show: { type: String, required: true },
          reportingDate: { type: String },
          reportingTime: { type: String },
          reportingLocation: { type: String },
          status: { type: String, enum: ["Declined", "Withdrawn"], required: true },
          reason: { type: String, trim: true, maxlength: 300 },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
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
    timestamps: true,
  },
);
const Account = mongoose.model("Account", AccountSchema, "accounts");

// retrieveAll() - 1) find every account 2) ".select('-password')" removes the password hash from the
// result.
exports.retrieveAll = function () {
  return Account.find().select("-password");
};

// create(data) - 1) build a new Account from the data 2) save it (schema rules like phone format run
// now).
exports.create = function (data) {
  return new Account(data).save();
};

// findByEmail(email) - 1) lowercase and trim the email (same cleaning the schema applies) 2) return
// the matching account WITH its password hash (login needs it to compare).
exports.findByEmail = function (email) {
  return Account.findOne({ email: email.toLowerCase().trim() });
};

// findById(id) - 1) find one account by its id 2) hide the password hash.
exports.findById = function (id) {
  return Account.findById(id).select("-password");
};

// retrieveVolunteers() - all accounts with role "volunteer", returning only name, postalCode, address,
// lat, lng.
exports.retrieveVolunteers = function () {
  return Account.find({ role: "volunteer" }).select("name postalCode address lat lng");
};

// updateAvailableShows(id, availableShows) - 1) replace the volunteer's whole availableShows list 2)
// run schema validation 3) return the updated account without the password.
exports.updateAvailableShows = function (id, availableShows) {
  return Account.findByIdAndUpdate(
    id,
    { availableShows },
    { new: true, runValidators: true },
  ).select("-password");
};

// removeAvailableShows(id, shows) - 1) $pull = remove every listed show from availableShows 2) return
// the updated account without the password.
exports.removeAvailableShows = function (id, shows) {
  return Account.findByIdAndUpdate(
    id,
    { $pull: { availableShows: { $in: shows } } },
    { new: true },
  ).select("-password");
};
// logWithdrawnShow(id, entry) - ONE database update that does two things so they can never disagree:
// 1) $push the decline/withdraw record into withdrawnShows 2) $pull that show out of availableShows 3)
// return the updated account without the password.
exports.logWithdrawnShow = function (id, entry) {
  return Account.findByIdAndUpdate(
    id,
    {
      $push: { withdrawnShows: entry },
      $pull: { availableShows: entry.show },
    },
    { new: true, runValidators: true },
  ).select("-password");
};

// findVolunteersByShow(show) - all volunteers whose availableShows contains this show (name trimmed
// first). Used by the allocation run.
exports.findVolunteersByShow = function (show) {
  return Account.find({ role: "volunteer", availableShows: show.trim() });
};

// findByPhone(phone) - 1) remove all spaces from the number 2) return the account that has it (or
// null). Used to stop the same phone signing up twice.
exports.findByPhone = function (phone) {
  return Account.findOne({ phone: String(phone).replace(/\s+/g, "") });
};

// retrieveVolunteerNames() - volunteers' name + email only, sorted A to Z. collation({ locale: "en" })
// makes sorting ignore upper/lower case.
exports.retrieveVolunteerNames = () =>
  Account.find({ role: "volunteer" })
    .select("name email")
    .sort({ name: 1 })
    .collation({ locale: "en" });
