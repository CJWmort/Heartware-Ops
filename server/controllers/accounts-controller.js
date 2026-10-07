// Get Service model
const Account = require('../models/account-model');

// Bcrypt used to Hash and protect passwords
const bcrypt = require('bcrypt');

exports.usersGet = async (req,res) => {
    try {
        const userList = await Account.retrieveAll();
        res.json(userList);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
