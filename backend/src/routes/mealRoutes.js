const express = require('express');
const router = express.Router();
const { getMealTimings, getMenu } = require('../controllers/mealController');

// Public endpoints
router.get('/timings', getMealTimings);
router.get('/menu', getMenu);

module.exports = router;
