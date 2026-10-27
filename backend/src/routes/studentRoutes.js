const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getDayMeals,
  getDashboard,
  getBookings,
  cancelMeal,
  restoreMeal,
  applyLeave,
  getLeaves,
  cancelLeave,
  getMealQr,
  getBilling,
  getBookingHistory,
  getStudentMeals,
  getPreferences,
  updatePreferences,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} = require('../controllers/studentController');

// All student routes require authentication and STUDENT role
router.use(authenticate, authorize(['STUDENT']));

router.get('/day', getDayMeals);
router.get('/dashboard', getDashboard);
router.get('/bookings', getBookings);
router.get('/meals', getStudentMeals);
router.get('/me/meals', getStudentMeals);
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.get('/me/preferences', getPreferences);
router.put('/me/preferences', updatePreferences);
router.get('/notifications', getNotifications);
router.get('/me/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationAsRead);
router.put('/notifications/read-all', markAllNotificationsAsRead);
router.get('/history', getBookingHistory);
router.get('/me/history', getBookingHistory);
router.post('/cancel-meal', cancelMeal);
router.post('/restore-meal', restoreMeal);
router.post('/apply-leave', applyLeave);
router.get('/leaves', getLeaves);
router.post('/cancel-leave', cancelLeave);
router.get('/qr/:bookingId', getMealQr);
router.get('/billing', getBilling);

module.exports = router;
