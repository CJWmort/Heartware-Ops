// Show endpoints: all shows, one by name, by date or by id.

const mongoose = require('mongoose');
const Shows = require('../models/shows-model');
const sendServerError = require('../utils/send-server-error')

// isValidId(id) - true when the text looks like a real MongoDB id.
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// showsGet - replies with all shows, earliest date first.
exports.showsGet = async (req, res) => {
    try {
        const showList = await Shows.retrieveAll();
        res.json(showList);
    } catch (error) {
        sendServerError(res, error);
    }
};

// showGetByName - 1) find a show by name (case-insensitive) 2) none -> 404 3) reply.
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

// showsGetByDate - 1) date must be YYYY-MM-DD (400) 2) reply with the shows on that date.
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

// showGetById - 1) the id must be valid (400) 2) find it (404 if none) 3) reply.
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
