const express = require('express');
const schoolsController = require('../controllers/schools-controller');
const router = express.Router();
 
const { requireRole } = require('../middleware/auth-middleware');
 
// '/api/schools/<endpoint>'
// Note: specific paths (/name, /zone, /postal) must come BEFORE '/:id',
// otherwise Express treats words like "zone" as an id.
 
// ===== READ =====
router.get('/', schoolsController.schoolsGet); // endpoint - Fetch all schools
router.get('/name/:name', schoolsController.schoolGetByName); // endpoint - Fetch one school by name
router.get('/zone/:zone', schoolsController.schoolsGetByZone); // endpoint - Fetch all schools in a zone (NORTH, SOUTH, EAST, WEST)
router.get('/postal/:postalCode', schoolsController.schoolGetByPostalCode); // endpoint - Fetch one school by postal code
router.get('/:id', schoolsController.schoolGetById); // endpoint - Fetch one school by _id
 
// ===== DELETE =====
router.delete('/name/:name', requireRole('admin'), schoolsController.schoolDeleteByName); // endpoint - Delete one school by name (admin only)
router.delete('/:id', requireRole('admin'), schoolsController.schoolDeleteById); // endpoint - Delete one school by _id (admin only)
 
 
module.exports = router;