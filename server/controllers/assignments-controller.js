const mongoose = require('mongoose');
const Assignments = require('../models/assignments-model');
const Account = require('../models/account-model');
const School = require('../models/schools-model');
const dotenv = require("dotenv");


const { haversine } = require('../utils/haversine');
const { scarcityFirst } = require('../utils/scarcityFirst');
const { addPositions } = require('../utils/geocode');

dotenv.config({ path: "./config.env" }); //process.env.ONEMAP_TOKEN

// GET /api/assignments/
exports.getAssignments = async (req, res) => {
    try {
        const assignments = await Assignments.retrieveAll();
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
            let volPos = await addPositions(volunteers, process.env.ONEMAP_TOKEN);
            let schools = await School.findByShow(show);
            let result = scarcityFirst(volPos.located,schools);
            await Assignments.createMany(result);
        }
        const assignments = await Assignments.retrieveAll();
        res.json(assignments);
    } catch (error) {
        res.status(500).json({message: error.message})
    }
}