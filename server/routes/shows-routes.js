const express = require("express");
const showsController = require("../controllers/shows-controller");
const { requireLogin } = require("../middleware/auth-middleware");
const router = express.Router();
router.use(requireLogin);

// '/api/shows/<endpoint>'
// Note: specific paths (/name, /date) must come BEFORE '/:id',
// otherwise Express treats words like "name" as an id.

// ===== READ =====
router.get("/", showsController.showsGet); // endpoint - Fetch all shows, earliest first
router.get("/name/:name", showsController.showGetByName); // endpoint - Fetch one show by name
router.get("/date/:date", showsController.showsGetByDate); // endpoint - Fetch all shows on a date
router.get("/:id", showsController.showGetById); // endpoint - Fetch one show by _id

module.exports = router;
