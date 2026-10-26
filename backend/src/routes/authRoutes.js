const express = require('express');
const router = express.Router();
const { signup, login, getMe } = require('../controllers/authController');
const {
  getBookingHistory,
  getStudentMeals,
  getPreferences,
  updatePreferences,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} = require('../controllers/studentController');
const { authenticate } = require('../middleware/auth');

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', authenticate, getMe);
router.get('/me/history', authenticate, getBookingHistory);
router.get('/me/meals', authenticate, getStudentMeals);
router.get('/me/preferences', authenticate, getPreferences);
router.put('/me/preferences', authenticate, updatePreferences);
router.get('/me/notifications', authenticate, getNotifications);
router.patch('/me/notifications/:id/read', authenticate, markNotificationAsRead);
router.put('/me/notifications/read-all', authenticate, markAllNotificationsAsRead);

module.exports = router;
