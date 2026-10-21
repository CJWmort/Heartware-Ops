const mongoose = require('mongoose');

// Create a new 'account' schema
const AccountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
        // FIX: removed `unique: true`. Two different people can share a name (e.g. two "Tan Wei Ming"), and the old rule
        // made the second one's sign-up fail with "name already registered". Email and phone stay unique: they identify a person.
        // NOTE: MongoDB keeps an existing unique index even after this line is removed. Run this once in mongosh / Compass:
        //   db.accounts.dropIndex("name_1")
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    postalCode: {
        type: String,
        required: true,
        trim: true,
        match: [/^\d{6}$/, 'Please enter a valid 6-digit Singapore postal code']
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
        match: [/^[689]\d{7}$/, 'Please enter a valid 8-digit Singapore phone number']
    },
    role: {
        type: String,
        required: true,
        // FIX: any text could be saved as a role. Only the two roles the app understands are allowed now.
        enum: { values: ['volunteer', 'admin'], message: 'Role must be volunteer or admin' }
    },
    password: {
        type: String,
        required: true
    },
    availableShows: {
        type: [String],
        default: []
    },
    // Log of shows the volunteer declined or withdrew from. Their assignment is deleted,
    // so this is the only record of where they were going and why they left.
    withdrawnShows: {
        // one entry per show they declined or withdrew from (written by logWithdrawnShow)
        type: [{
            _id: false,                                                      // entries need no id of their own
            showId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shows' }, // _id in the shows collection
            show: { type: String, required: true },                          // e.g. "NE Show 2"
            reportingDate: { type: String },                                 // show date, e.g. "2027-07-03"
            reportingTime: { type: String },                                 // school's reporting time, e.g. "1:30pm"
            reportingLocation: { type: String },                             // school name, e.g. "Xingnan Primary School"
            status: { type: String, enum: ['Declined', 'Withdrawn'], required: true },
            reason: { type: String, trim: true, maxlength: 300 },
            at: { type: Date, default: Date.now }                            // when they declined / withdrew
        }],
        default: []
    },
    // NEW: when the volunteer ticked the location-sharing consent box at sign up (not required, so old accounts still load)
    locationConsentAt: {
        type: Date
    },
    lat: {
        type: Number,
        required: true
    },
    lng: {
        type: Number,
        required: true
    }
}, {
    timestamps: true // auto timestamp management (createdAt, updatedAt) will update automatically based on methods used
});
// 'account' refer to the 'accounts' collection in our database
const Account = mongoose.model('Account', AccountSchema, 'accounts');

// CRUD Methods for Accounts Schema

exports.retrieveAll = function () {
    return Account.find().select('-password'); // ".select('-password')" hides password field
};

exports.create = function (data) {
    return new Account(data).save();
};

exports.findByEmail = function (email) {
    return Account.findOne({ email: email.toLowerCase().trim() });
};

exports.findById = function (id) {
    return Account.findById(id).select('-password');
};

// Fetch all volunteers (name, postalCode)
exports.retrieveVolunteers = function () {
    return Account.find({ role: 'volunteer' }).select('name postalCode address lat lng');
};

// Update the shows a volunteer is available for
exports.updateAvailableShows = function (id, availableShows) {
    return Account.findByIdAndUpdate(
        id,
        { availableShows },
        { new: true, runValidators: true } // return the updated doc
    ).select('-password');
};

// Remove the given shows from a volunteer's available shows
exports.removeAvailableShows = function (id, shows) {
    return Account.findByIdAndUpdate(
        id,
        { $pull: { availableShows: { $in: shows } } },
        { new: true } // return the updated doc
    ).select('-password');
};
// Volunteer declined / withdrew from a show: add the log entry AND stop them being available
// for that show, in one update (so the two can never disagree)
exports.logWithdrawnShow = function (id, entry) {
    return Account.findByIdAndUpdate(
        id,
        {
            $push: { withdrawnShows: entry },
            $pull: { availableShows: entry.show }
        },
        { new: true, runValidators: true } // return the updated doc
    ).select('-password');
};

// in account-model.js
exports.findVolunteersByShow = function (show) {
  return Account.find({ role: "volunteer", availableShows: show.trim() });
};

// Used by registration to stop the same phone number signing up twice
exports.findByPhone = function (phone) {
    return Account.findOne({ phone: String(phone).replace(/\s+/g, '') });
};
