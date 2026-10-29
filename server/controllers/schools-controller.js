// Get Schools model
const mongoose = require('mongoose');
const Schools = require('../models/schools-model');
const sendServerError = require('../utils/send-server-error')

// Helper: check that an id is a valid MongoDB ObjectId before querying
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ===== READ =====

// GET /schools  → all schools
exports.schoolsGet = async (req, res) => {
    try {
        const schoolList = await Schools.retrieveAll();
        res.json(schoolList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// GET /schools/name/:name  → one school by name
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

// GET /schools/show/:show  → all schools in a show (NE1,NE2,NE3,NE4)
exports.schoolsGetByShow = async (req, res) => {
    try {
        const schoolList = await Schools.findByShow(req.params.show);
        res.json(schoolList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// GET /schools/postal/:postalCode  → one school by postal code
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

