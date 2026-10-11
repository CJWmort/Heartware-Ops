const mongoose = require('mongoose');
const Allocation = require('../models/assignments-model');
const Account = require('../models/account-model');
const School = require('../models/schools-model');
const dotenv = require("dotenv");


const { haversine } = require('../utils/haversine');
const { scarcityFirst } = require('../utils/scarcityFirst');
const { addPositions } = require('../utils/geocode');

dotenv.config({ path: "./config.env" }); //process.env.ONEMAP_TOKEN

// GET /api/allocations/
exports.getAllocations = async (req, res) => {
    try {
        const allocations = await Allocations.retrieveAll();
        res.json(allocations);
    } catch (error) {
        res.status(500).json({message: error.message});
    }
};

// POST /api/allocations/run/ -- assigns volunteers to schools 
exports.runAllocations = async (req,res) => {
    try {
        let volunteers = await Account.retrieveVolunteers();
        let volPos = await addPositions(volunteers, process.env.ONEMAP_TOKEN);
        let schools = await School.retrieveAll();
        let result = scarcityFirst(volPos.located,schools);
        res.json(result);
    } catch (error) {
        res.status(500).json({message: error.message})
    }
}