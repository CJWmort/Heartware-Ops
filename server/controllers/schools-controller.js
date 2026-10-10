// Get Schools model
const mongoose = require('mongoose');
const Schools = require('../models/schools-model');

// Helper: check that an id is a valid MongoDB ObjectId before querying
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ===== READ =====

// GET /schools  → all schools
exports.schoolsGet = async (req, res) => {
    try {
        const schoolList = await Schools.retrieveAll();
        res.json(schoolList);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// GET /schools/:id  → one school by _id
exports.schoolGetById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidId(id)) {
            return res.status(400).json({ message: 'Invalid school id' });
        }

        const school = await Schools.findById(id);
        if (!school) {
            return res.status(404).json({ message: 'School not found' });
        }
        res.json(school);
    } catch (error) {
        res.status(500).json({ message: error.message });
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
        res.status(500).json({ message: error.message });
    }
};

// GET /schools/zone/:zone  → all schools in a zone (NORTH, SOUTH, EAST, WEST)
exports.schoolsGetByZone = async (req, res) => {
    try {
        const schoolList = await Schools.findByZone(req.params.zone);
        res.json(schoolList);
    } catch (error) {
        res.status(500).json({ message: error.message });
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
        res.status(500).json({ message: error.message });
    }
};

// ===== DELETE =====

// DELETE /schools/:id  → delete one school by _id
exports.schoolDeleteById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidId(id)) {
            return res.status(400).json({ message: 'Invalid school id' });
        }

        const deleted = await Schools.deleteById(id);
        if (!deleted) {
            return res.status(404).json({ message: 'School not found' });
        }
        res.json({ message: `${deleted.name} deleted successfully`, school: deleted });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// DELETE /schools/name/:name  → delete one school by name
exports.schoolDeleteByName = async (req, res) => {
    try {
        const deleted = await Schools.deleteByName(req.params.name);
        if (!deleted) {
            return res.status(404).json({ message: 'School not found' });
        }
        res.json({ message: `${deleted.name} deleted successfully`, school: deleted });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};