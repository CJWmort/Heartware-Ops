const express = require("express");
const schoolsController = require("../controllers/schools-controller");
const router = express.Router();

const { requireLogin } = require("../middleware/auth-middleware");
router.use(requireLogin);

// '/api/schools/<endpoint>'
// Note: specific paths (/name, /show, /postal) must come BEFORE '/:id',
// otherwise Express treats words like "show" as an id.

// ===== READ =====
router.get("/", schoolsController.schoolsGet); // endpoint - Fetch all schools
router.get("/name/:name", schoolsController.schoolGetByName); // endpoint - Fetch one school by name
router.get("/show/:show", schoolsController.schoolsGetByShow); // endpoint - Fetch all schools in a show
router.get("/postal/:postalCode", schoolsController.schoolGetByPostalCode); // endpoint - Fetch one school by postal code

module.exports = router;
