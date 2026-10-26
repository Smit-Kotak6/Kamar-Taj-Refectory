const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const studentRoutes = require('./routes/studentRoutes');
const staffRoutes = require('./routes/staffRoutes');
const adminRoutes = require('./routes/adminRoutes');
const mealRoutes = require('./routes/mealRoutes');

const { authenticate } = require('./middleware/auth');
const {
  getBookingHistory,
  getStudentMeals,
  getPreferences,
  updatePreferences,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead
} = require('./controllers/studentController');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'The Kamar-Taj Refectory API',
    timestamp: new Date().toISOString()
  });
});

// Direct student history, meals, preferences & notifications routes
app.get(['/me/history', '/api/me/history'], authenticate, getBookingHistory);
app.get(['/me/meals', '/api/me/meals'], authenticate, getStudentMeals);
app.get(['/me/preferences', '/api/me/preferences'], authenticate, getPreferences);
app.put(['/me/preferences', '/api/me/preferences'], authenticate, updatePreferences);
app.get(['/me/notifications', '/api/me/notifications'], authenticate, getNotifications);
app.patch(['/me/notifications/:id/read', '/api/me/notifications/:id/read'], authenticate, markNotificationAsRead);
app.put(['/me/notifications/read-all', '/api/me/notifications/read-all'], authenticate, markAllNotificationsAsRead);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/meals', mealRoutes);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
