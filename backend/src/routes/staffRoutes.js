const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { verifyAndRedeem, getStaffStats } = require('../controllers/staffController');

// All staff routes require authentication and STAFF (or ADMIN) role
router.use(authenticate, authorize(['STAFF', 'ADMIN']));

router.post('/verify-redeem', verifyAndRedeem);
router.get('/stats', getStaffStats);

module.exports = router;
