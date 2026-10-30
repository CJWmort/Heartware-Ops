// Connects the show URLs (/api/shows/...) to their controller functions.

const express = require("express");
const showsController = require("../controllers/shows-controller");
const { requireLogin } = require("../middleware/auth-middleware");
const router = express.Router();
router.use(requireLogin);

router.get("/", showsController.showsGet);
router.get("/name/:name", showsController.showGetByName);
router.get("/date/:date", showsController.showsGetByDate);
router.get("/:id", showsController.showGetById);

module.exports = router;
