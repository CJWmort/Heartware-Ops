const mongoose = require('mongoose');

// Create a new 'account' schema
const AccountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
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
        required: true
    },
    password: {
        type: String,
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