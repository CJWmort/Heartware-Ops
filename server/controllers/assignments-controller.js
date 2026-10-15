const mongoose = require('mongoose');
const Assignments = require('../models/assignments-model');
const Account = require('../models/account-model');
const School = require('../models/schools-model');
const dotenv = require("dotenv");


const { scarcityFirst } = require('../utils/scarcityFirst');
const { greedyByPair } = require('../utils/greedy');

// dotenv.config({ path: "./config.env" }); //process.env.ONEMAP_TOKEN

// GET /api/assignments/
exports.getAssignments = async (req, res) => {
    try {
        const assignments = await Assignments.retrieveAll();
        res.json(assignments);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

// GET /api/assignments/me -- the logged in volunteer's assignments
exports.getMyAssignments = async (req, res) => {
    try {
        const assignments = await Assignments.findMine(req.session.userId);
        res.json(assignments);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

// GET /api/assignments/show/:show
exports.getShowAssignments = async (req, res) => {
    try {
        const show = req.params.show
        const assignments = await Assignments.findByShow(show);
        res.json(assignments);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

// GET /api/assignments/run/ -- assigns volunteers to schools
exports.runAssignments = async (req,res) => {
    try {
        await Assignments.deleteAll();
        for (show of ["NE Show 1","NE Show 2","NE Show 3","NE Show 4"]){
            let volunteers = await Account.findVolunteersByShow(show);
            let schools = await School.findByShow(show);
            let result = haversine(volunteers,schools); // scarcityFirst -- temporary using greedy to be more efficient when vol < schools
            await Assignments.createMany(result);
            console.log(volunteers, show);
        }
        const assignments = await Assignments.retrieveAll();
        res.json(assignments);
    } catch (error) {
        res.status(500).json({message: error.message})
    }
}

// PATCH /api/assignments/:id/accept -- logged in volunteer accepts their assignment
exports.acceptMyAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({message: 'Invalid assignment id'});
        }

        const assignment = await Assignments.acceptMine(id, req.session.userId);
        if (!assignment) {
            return res.status(404).json({message: 'No pending assignment found to accept.'});
        }
        res.json(assignment);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

// PATCH /api/assignments/:id/withdraw -- logged in volunteer pulls out of an accepted assignment
// body: { reason?: "..." }
exports.withdrawMyAssignment = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({message: 'Invalid assignment id'});
        }

        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        if (reason.length > 300) {
            return res.status(400).json({message: 'Reason must be 300 characters or fewer.'});
        }

        const assignment = await Assignments.withdrawMine(id, req.session.userId, reason);
        if (!assignment) {
            return res.status(404).json({message: 'No accepted assignment found to pull out of.'});
        }
        res.json(assignment);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};
