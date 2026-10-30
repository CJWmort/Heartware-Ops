// Connects the school URLs (/api/schools/...) to their controller functions.

const express = require("express");
const schoolsController = require("../controllers/schools-controller");
const router = express.Router();

const { requireLogin } = require("../middleware/auth-middleware");
router.use(requireLogin);

router.get("/", schoolsController.schoolsGet);
router.get("/name/:name", schoolsController.schoolGetByName);
router.get("/show/:show", schoolsController.schoolsGetByShow);
router.get("/postal/:postalCode", schoolsController.schoolGetByPostalCode);

module.exports = router;
