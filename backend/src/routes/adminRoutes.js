const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createUser,
  getUsers,
  updateMembership,
  closeMealOrMess,
  getClosures,
  setMealTiming,
  recordPayment,
  getReports
} = require('../controllers/adminController');

// All admin routes require authentication and ADMIN role
router.use(authenticate, authorize(['ADMIN']));

router.post('/users', createUser);
router.get('/users', getUsers);
router.put('/membership/:userId', updateMembership);
router.post('/closures', closeMealOrMess);
router.get('/closures', getClosures);
router.post('/timings', setMealTiming);
router.post('/billing/record-payment', recordPayment);
router.get('/reports', getReports);

module.exports = router;
