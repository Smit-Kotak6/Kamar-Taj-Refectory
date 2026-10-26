const prisma = require('../config/db');
const { getCurrentDateIST } = require('../utils/timeUtils');

/**
 * @route   GET /api/meals/timings
 * @desc    Get configured meal timings (defaults and date overrides)
 */
const getMealTimings = async (req, res, next) => {
  try {
    const today = req.query.date || getCurrentDateIST();

    const defaultTimings = await prisma.mealSchedule.findMany();
    const overrides = await prisma.mealScheduleOverride.findMany({
      where: { date: today }
    });

    return res.status(200).json({
      success: true,
      date: today,
      defaultTimings,
      overrides
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/meals/menu
 * @desc    Get static menu poster URL and notices (Section 11)
 */
const getMenu = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      menuUrl: '/assets/weekly_mess_menu.png',
      description: 'Weekly mess menu schedule for The Kamar-Taj Refectory.',
      notices: [
        'Special feast on Sundays during dinner.',
        'Lunch booking cutoff is strictly 10:30 AM.',
        'Dinner booking cutoff is strictly 05:30 PM.'
      ]
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMealTimings,
  getMenu
};
