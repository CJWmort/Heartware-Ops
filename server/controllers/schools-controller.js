// School endpoints: all schools, one by name, by show or by postal code.

const mongoose = require('mongoose');
const Schools = require('../models/schools-model');
const sendServerError = require('../utils/send-server-error')

// isValidId(id) - true when the text looks like a real MongoDB id (checked before querying so a bad id
// gives 400 instead of a crash).
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// schoolsGet - replies with all schools sorted by name.
exports.schoolsGet = async (req, res) => {
    try {
        const schoolList = await Schools.retrieveAll();
        res.json(schoolList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// schoolGetByName - 1) find one school by exact name (case-insensitive) 2) none -> 404 3) reply.
exports.schoolGetByName = async (req, res) => {
    try {
        const school = await Schools.findByName(req.params.name);
        if (!school) {
            return res.status(404).json({ message: 'School not found' });
        }
        res.json(school);
    } catch (error) {
        sendServerError(res, error);
    }
};

// schoolsGetByShow - replies with all schools in one show, sorted by name.
exports.schoolsGetByShow = async (req, res) => {
    try {
        const schoolList = await Schools.findByShow(req.params.show);
        res.json(schoolList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// schoolGetByPostalCode - 1) the code must be 6 digits (400) 2) find the school (404 if none) 3)
// reply.
exports.schoolGetByPostalCode = async (req, res) => {
    try {
        const { postalCode } = req.params;
        if (!/^\d{6}$/.test(postalCode)) {
            return res.status(400).json({ message: 'Please enter a valid 6-digit Singapore postal code' });
        }

        const school = await Schools.findByPostalCode(postalCode);
        if (!school) {
            return res.status(404).json({ message: 'School not found' });
        }
        res.json(school);
    } catch (error) {
        sendServerError(res, error);
    }
};

