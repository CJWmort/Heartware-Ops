// Get Shows model
const mongoose = require('mongoose');
const Shows = require('../models/shows-model');
const sendServerError = require('../utils/send-server-error')

// Helper: check that an id is a valid MongoDB ObjectId before querying
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ===== READ =====

// GET /shows  → all shows, earliest first
exports.showsGet = async (req, res) => {
    try {
        const showList = await Shows.retrieveAll();
        res.json(showList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// GET /shows/name/:name  → one show by name (e.g. NE Show 1)
exports.showGetByName = async (req, res) => {
    try {
        const show = await Shows.findByName(req.params.name);
        if (!show) {
            return res.status(404).json({ message: 'Show not found' });
        }
        res.json(show);
    } catch (error) {
        sendServerError(res, error);
    }
};

// GET /shows/date/:date  → all shows on a date (YYYY-MM-DD)
exports.showsGetByDate = async (req, res) => {
    try {
        const { date } = req.params;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ message: 'Date must be in YYYY-MM-DD format' });
        }

        const showList = await Shows.findByDate(date);
        res.json(showList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// GET /shows/:id  → one show by _id
exports.showGetById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidId(id)) {
            return res.status(400).json({ message: 'Invalid show id' });
        }

        const show = await Shows.findById(id);
        if (!show) {
            return res.status(404).json({ message: 'Show not found' });
        }
        res.json(show);
    } catch (error) {
        sendServerError(res, error);
    }
};
