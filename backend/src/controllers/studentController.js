const crypto = require('crypto');
const QRCode = require('qrcode');
const prisma = require('../config/db');
const {
  getCurrentDateIST,
  getCurrentTimeIST,
  getServerNowIST,
  isCutoffPassed,
  getDateRangeArray
} = require('../utils/timeUtils');

// Helper to generate a cryptographically secure unpredictable QR token (Section 9.6)
const generateSecureToken = () => {
  return 'MESS-' + crypto.randomBytes(16).toString('hex');
};

// Helper to generate a human-readable booking code for manual entry fallback (Section 4.2 & 9.3)
const generateBookingCode = () => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'KT-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Ensures default meal bookings exist for a student on a specified date
 * if the student is an active mess member (Section 5 & 6).
 */
const ensureDefaultBookingsForDate = async (userId, dateStr) => {
  // Check student membership
  const membership = await prisma.studentMembership.findUnique({
    where: { userId }
  });

  if (!membership || !membership.isActive) {
    return []; // Not eligible for default booking
  }

  const mealDate = new Date(dateStr);
  if (mealDate < new Date(membership.startDate.toISOString().split('T')[0])) {
    return []; // Before membership start date
  }
  if (membership.endDate && mealDate > new Date(membership.endDate.toISOString().split('T')[0])) {
    return []; // After membership expiry date
  }

  // Check closures for this date (Section 10)
  const closures = await prisma.messClosure.findMany({
    where: { date: dateStr }
  });
  const isEntireMessClosed = closures.some((c) => c.mealType === null);
  const closedMealTypes = new Set(closures.map((c) => c.mealType).filter(Boolean));

  const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER'];
  const existingBookings = await prisma.mealBooking.findMany({
    where: { userId, date: dateStr }
  });
  const existingMealTypes = new Set(existingBookings.map((b) => b.mealType));

  // Backfill bookingCode for any existing bookings that don't have one
  for (const b of existingBookings) {
    if (!b.bookingCode) {
      await prisma.mealBooking.update({
        where: { id: b.id },
        data: { bookingCode: generateBookingCode() }
      });
    }
  }

  const missingMealTypes = mealTypes.filter((type) => !existingMealTypes.has(type));

  if (missingMealTypes.length > 0) {
    const toCreate = missingMealTypes.map((type) => {
      const isClosed = isEntireMessClosed || closedMealTypes.has(type);
      return {
        userId,
        date: dateStr,
        mealType: type,
        status: isClosed ? 'CANCELLED_MESS_CLOSED' : 'BOOKED',
        qrToken: generateSecureToken(),
        bookingCode: generateBookingCode()
      };
    });

    await prisma.mealBooking.createMany({
      data: toCreate,
      skipDuplicates: true
    });
  }

  // Fetch and return the updated day's bookings
  return prisma.mealBooking.findMany({
    where: { userId, date: dateStr },
    orderBy: { mealType: 'asc' }
  });
};

/**
 * @route   GET /api/student/dashboard
 * @desc    Get student dashboard summary: today's meals, membership info, active leaves
 */
const getDashboard = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = getCurrentDateIST();

    // Ensure default bookings for today
    await ensureDefaultBookingsForDate(userId, today);

    // Fetch schedules
    const schedules = await prisma.mealSchedule.findMany();
    const scheduleMap = {};
    schedules.forEach((s) => (scheduleMap[s.mealType] = s));

    // Fetch overrides for today
    const overrides = await prisma.mealScheduleOverride.findMany({
      where: { date: today }
    });
    overrides.forEach((o) => {
      scheduleMap[o.mealType] = { ...scheduleMap[o.mealType], ...o };
    });

    // Fetch closures
    const closures = await prisma.messClosure.findMany({
      where: { date: today }
    });
    const isEntireMessClosed = closures.some((c) => c.mealType === null);
    const closedMealTypes = new Set(closures.map((c) => c.mealType).filter(Boolean));

    // Fetch bookings for today
    const bookings = await prisma.mealBooking.findMany({
      where: { userId, date: today },
      orderBy: { mealType: 'asc' }
    });

    // Augment bookings with cutoff status and closure notice
    const augmentedBookings = bookings.map((b) => {
      const timing = scheduleMap[b.mealType] || {
        cutoffTime: b.mealType === 'LUNCH' ? '10:30' : b.mealType === 'DINNER' ? '17:30' : '07:00',
        serviceStartTime: '12:00',
        serviceEndTime: '14:30'
      };

      const cutoffPassed = isCutoffPassed(b.date, timing.cutoffTime);
      const isClosed = isEntireMessClosed || closedMealTypes.has(b.mealType);

      return {
        ...b,
        cutoffTime: timing.cutoffTime,
        serviceWindow: `${timing.serviceStartTime} - ${timing.serviceEndTime}`,
        cutoffPassed,
        isClosed,
        closureNotice: isClosed ? 'UNAVAILABLE — MESS CLOSED' : null
      };
    });

    // Check outstanding billing
    const billing = await prisma.billingRecord.findMany({
      where: { userId },
      orderBy: { month: 'desc' },
      take: 3
    });

    return res.status(200).json({
      success: true,
      data: {
        date: today,
        user: req.user,
        membership: req.user.membership,
        meals: augmentedBookings,
        recentBills: billing
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/student/bookings
 * @desc    View meal bookings for a specific date or date range
 */
const getBookings = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const date = req.query.date || getCurrentDateIST();

    await ensureDefaultBookingsForDate(userId, date);

    const bookings = await prisma.mealBooking.findMany({
      where: { userId, date },
      orderBy: { mealType: 'asc' }
    });

    return res.status(200).json({
      success: true,
      date,
      bookings
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/cancel-meal
 * @desc    Cancel an eligible meal booking before the cutoff (Section 6 & 7.2)
 */
const cancelMeal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required.' });
    }

    const booking = await prisma.mealBooking.findUnique({
      where: { id: parseInt(bookingId) }
    });

    if (!booking || booking.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Meal booking record not found.' });
    }

    if (booking.status === 'REDEEMED') {
      return res.status(400).json({ success: false, message: 'Cannot cancel an already consumed meal.' });
    }

    if (booking.status === 'CANCELLED_MESS_CLOSED') {
      return res.status(400).json({ success: false, message: 'Meal is already marked as closed by mess administration.' });
    }

    // Determine cutoff
    const override = await prisma.mealScheduleOverride.findUnique({
      where: { date_mealType: { date: booking.date, mealType: booking.mealType } }
    });
    const defaultSchedule = await prisma.mealSchedule.findUnique({
      where: { mealType: booking.mealType }
    });

    const cutoffTime = override?.cutoffTime || defaultSchedule?.cutoffTime || (booking.mealType === 'LUNCH' ? '10:30' : booking.mealType === 'DINNER' ? '17:30' : '07:00');

    // Strict cutoff check
    if (isCutoffPassed(booking.date, cutoffTime)) {
      return res.status(400).json({
        success: false,
        message: `Cancellation locked: Booking cutoff (${cutoffTime}) for ${booking.mealType} on ${booking.date} has passed.`
      });
    }

    // Update status to CANCELLED_BY_STUDENT
    const updated = await prisma.mealBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED_BY_STUDENT' }
    });

    // Record notification alert
    await prisma.notification.create({
      data: {
        userId,
        type: 'BOOKING_CANCELLED',
        title: 'Meal Cancelled',
        message: `Your ${booking.mealType} booking on ${booking.date} was cancelled.`,
        priority: 'normal'
      }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `${booking.mealType} on ${booking.date} has been successfully cancelled.`,
      booking: updated
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/restore-meal
 * @desc    Restore a cancelled meal back to BOOKED before cutoff
 */
const restoreMeal = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { bookingId } = req.body;

    const booking = await prisma.mealBooking.findUnique({
      where: { id: parseInt(bookingId) }
    });

    if (!booking || booking.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Meal booking record not found.' });
    }

    if (booking.status !== 'CANCELLED_BY_STUDENT') {
      return res.status(400).json({ success: false, message: 'Only student-cancelled meals can be manually restored.' });
    }

    // Cutoff check
    const defaultSchedule = await prisma.mealSchedule.findUnique({
      where: { mealType: booking.mealType }
    });
    const cutoffTime = defaultSchedule?.cutoffTime || (booking.mealType === 'LUNCH' ? '10:30' : '17:30');

    if (isCutoffPassed(booking.date, cutoffTime)) {
      return res.status(400).json({
        success: false,
        message: `Restoration locked: Booking cutoff (${cutoffTime}) has passed.`
      });
    }

    const updated = await prisma.mealBooking.update({
      where: { id: booking.id },
      data: { status: 'BOOKED' }
    });

    // Record notification alert
    await prisma.notification.create({
      data: {
        userId,
        type: 'BOOKING_CONFIRMED',
        title: 'Meal Booking Restored',
        message: `Your ${booking.mealType} booking on ${booking.date} is confirmed. Manual code: ${booking.bookingCode || 'Generated'}.`,
        priority: 'normal'
      }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `${booking.mealType} booking successfully restored.`,
      booking: updated
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/apply-leave
 * @desc    Register leave for a date range (Section 7)
 */
const applyLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, reason } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required (YYYY-MM-DD).' });
    }

    if (endDate < startDate) {
      return res.status(400).json({ success: false, message: 'endDate cannot be earlier than startDate.' });
    }

    const today = getCurrentDateIST();
    if (endDate < today) {
      return res.status(400).json({ success: false, message: 'Cannot register leave in the past.' });
    }

    // Create Leave Record
    const leave = await prisma.leaveRequest.create({
      data: {
        userId,
        startDate,
        endDate,
        reason: reason || 'Home visit / Academic leave',
        status: 'ACTIVE'
      }
    });

    // Generate date list
    const dates = getDateRangeArray(startDate, endDate);
    const schedules = await prisma.mealSchedule.findMany();
    const scheduleMap = {};
    schedules.forEach((s) => (scheduleMap[s.mealType] = s.cutoffTime));

    let cancelledCount = 0;

    for (const d of dates) {
      // Ensure bookings exist
      await ensureDefaultBookingsForDate(userId, d);

      const dayBookings = await prisma.mealBooking.findMany({
        where: { userId, date: d, status: 'BOOKED' }
      });

      for (const b of dayBookings) {
        const cutoff = scheduleMap[b.mealType] || (b.mealType === 'LUNCH' ? '10:30' : '17:30');
        // Only cancel if cutoff has NOT passed (Section 7.2)
        if (!isCutoffPassed(b.date, cutoff)) {
          await prisma.mealBooking.update({
            where: { id: b.id },
            data: { status: 'CANCELLED_LEAVE' }
          });
          cancelledCount++;
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: `Leave successfully registered from ${startDate} to ${endDate}. ${cancelledCount} eligible meal(s) marked as on-leave.`,
      leave
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/student/leaves
 * @desc    Get student leave history
 */
const getLeaves = async (req, res, next) => {
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, leaves });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/student/cancel-leave
 * @desc    Cancel an active leave; restores future eligible meals to BOOKED (Section 7.3)
 */
const cancelLeave = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { leaveId } = req.body;

    const leave = await prisma.leaveRequest.findUnique({
      where: { id: parseInt(leaveId) }
    });

    if (!leave || leave.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Leave record not found.' });
    }

    if (leave.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: 'Leave is already cancelled.' });
    }

    await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: 'CANCELLED' }
    });

    // Restore meals whose cutoff has not yet passed
    const dates = getDateRangeArray(leave.startDate, leave.endDate);
    const schedules = await prisma.mealSchedule.findMany();
    const scheduleMap = {};
    schedules.forEach((s) => (scheduleMap[s.mealType] = s.cutoffTime));

    let restoredCount = 0;
    for (const d of dates) {
      const leaveMeals = await prisma.mealBooking.findMany({
        where: { userId, date: d, status: 'CANCELLED_LEAVE' }
      });

      for (const m of leaveMeals) {
        const cutoff = scheduleMap[m.mealType] || '10:30';
        if (!isCutoffPassed(m.date, cutoff)) {
          await prisma.mealBooking.update({
            where: { id: m.id },
            data: { status: 'BOOKED' }
          });
          restoredCount++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Leave cancelled. ${restoredCount} upcoming meal(s) restored to booked status.`
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/student/qr/:bookingId
 * @desc    Get secure QR code data URL and raw token for redemption (Section 9)
 */
const getMealQr = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const bookingId = parseInt(req.params.bookingId);

    const booking = await prisma.mealBooking.findUnique({
      where: { id: bookingId }
    });

    if (!booking || booking.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Meal booking not found.' });
    }

    if (booking.status !== 'BOOKED') {
      return res.status(400).json({
        success: false,
        message: `QR code unavailable. Current meal status is ${booking.status}.`
      });
    }

    // Ensure booking has a bookingCode
    if (!booking.bookingCode) {
      booking.bookingCode = generateBookingCode();
      await prisma.mealBooking.update({
        where: { id: booking.id },
        data: { bookingCode: booking.bookingCode }
      });
    }

    // Generate QR Code data URL
    const qrDataUrl = await QRCode.toDataURL(booking.qrToken, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 300
    });

    return res.status(200).json({
      success: true,
      booking: {
        id: booking.id,
        mealType: booking.mealType,
        date: booking.date,
        bookingCode: booking.bookingCode, // Short human-readable code for manual verification
        token: booking.qrToken,           // Raw QR token
        qrImage: qrDataUrl                // QR Code Image Data URL
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/student/billing
 * @desc    View billing records and outstanding dues (Section 12)
 */
const getBilling = async (req, res, next) => {
  try {
    const bills = await prisma.billingRecord.findMany({
      where: { userId: req.user.id },
      orderBy: { month: 'desc' }
    });

    const totalDue = bills.reduce((acc, curr) => acc + (curr.totalAmount - curr.paidAmount), 0);

    return res.status(200).json({
      success: true,
      totalDue,
      bills
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/student/history or /me/history
 * @desc    View booking & consumption history with date range filter (?from=&to=)
 */
const getBookingHistory = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { from, to } = req.query;

    const where = { userId };

    if (from && to) {
      where.date = { gte: from.trim(), lte: to.trim() };
    } else if (from) {
      where.date = { gte: from.trim() };
    } else if (to) {
      where.date = { lte: to.trim() };
    }

    const bookings = await prisma.mealBooking.findMany({
      where,
      orderBy: [
        { date: 'desc' },
        { mealType: 'asc' }
      ]
    });

    const history = bookings.map((b) => {
      let bookingStatus = 'confirmed';
      let consumptionStatus = 'not_consumed';

      if (b.status.startsWith('CANCELLED')) {
        bookingStatus = 'cancelled';
        consumptionStatus = 'not_consumed';
      } else if (b.status === 'REDEEMED') {
        bookingStatus = 'confirmed';
        consumptionStatus = 'redeemed';
      } else if (b.status === 'UNCONSUMED') {
        bookingStatus = 'confirmed';
        consumptionStatus = 'not_consumed';
      } else if (b.status === 'BOOKED') {
        bookingStatus = 'confirmed';
        consumptionStatus = 'not_consumed';
      }

      return {
        date: b.date,
        meal: b.mealType.toLowerCase(),
        bookingStatus,
        consumptionStatus
      };
    });

    return res.status(200).json({ history });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /me/meals?from=&to= or /api/student/meals
 * @desc    Get meals list with timing and bookingStatus across a date range
 */
const getStudentMeals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = getCurrentDateIST();
    const from = req.query.from ? req.query.from.trim() : today;
    const to = req.query.to ? req.query.to.trim() : from;

    const serverNow = getServerNowIST();

    // Generate array of dates
    const dates = getDateRangeArray(from, to);

    // Fetch default schedules
    const defaultSchedules = await prisma.mealSchedule.findMany();
    const scheduleMap = {};
    defaultSchedules.forEach((s) => {
      scheduleMap[s.mealType] = {
        startTime: s.serviceStartTime,
        endTime: s.serviceEndTime
      };
    });

    // Fallbacks if not seeded
    const fallbackTimings = {
      BREAKFAST: { startTime: '07:30', endTime: '09:30' },
      LUNCH: { startTime: '12:00', endTime: '14:30' },
      DINNER: { startTime: '19:30', endTime: '21:30' }
    };

    // Fetch date overrides in range
    const overrides = await prisma.mealScheduleOverride.findMany({
      where: { date: { in: dates } }
    });
    const overrideMap = {};
    overrides.forEach((o) => {
      overrideMap[`${o.date}_${o.mealType}`] = {
        startTime: o.serviceStartTime,
        endTime: o.serviceEndTime
      };
    });

    // Fetch closures in range
    const closures = await prisma.messClosure.findMany({
      where: { date: { in: dates } }
    });
    const closureSet = new Set();
    closures.forEach((c) => {
      if (c.mealType) {
        closureSet.add(`${c.date}_${c.mealType}`);
      } else {
        closureSet.add(`${c.date}_ALL`);
      }
    });

    // Fetch student's bookings in range
    const bookings = await prisma.mealBooking.findMany({
      where: { userId, date: { in: dates } }
    });
    const bookingMap = {};
    bookings.forEach((b) => {
      bookingMap[`${b.date}_${b.mealType}`] = b;
    });

    const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER'];
    const meals = [];

    for (const d of dates) {
      for (const m of mealTypes) {
        const timing =
          overrideMap[`${d}_${m}`] ||
          scheduleMap[m] ||
          fallbackTimings[m];

        const isClosed = closureSet.has(`${d}_ALL`) || closureSet.has(`${d}_${m}`);
        const booking = bookingMap[`${d}_${m}`];

        let bookingStatus = 'not_booked';

        if (isClosed) {
          bookingStatus = 'closed';
        } else if (booking) {
          if (booking.status === 'BOOKED' || booking.status === 'REDEEMED') {
            bookingStatus = 'confirmed';
          } else if (booking.status.startsWith('CANCELLED')) {
            bookingStatus = 'cancelled';
          } else {
            bookingStatus = 'not_booked';
          }
        }

        meals.push({
          date: d,
          meal: m.toLowerCase(),
          startTime: timing.startTime,
          endTime: timing.endTime,
          bookingStatus
        });
      }
    }

    return res.status(200).json({
      serverNow,
      meals
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /me/preferences or /api/student/preferences
 * @desc    Get student food preferences (diet type, allergies, kitchen notes)
 */
const getPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const pref = await prisma.studentPreference.findUnique({
      where: { userId }
    });

    if (!pref) {
      return res.status(200).json({
        success: true,
        preferences: {
          dietType: 'veg',
          allergies: [],
          notes: ''
        }
      });
    }

    return res.status(200).json({
      success: true,
      preferences: {
        dietType: pref.dietType,
        allergies: pref.allergies,
        notes: pref.notes || ''
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /me/preferences or /api/student/preferences
 * @desc    Save/update student food preferences
 */
const updatePreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { dietType, allergies, notes } = req.body;

    // Validate dietType
    const normalizedDiet = (dietType || 'veg').toString().toLowerCase().replace('_', '-');
    if (!['veg', 'non-veg', 'egg'].includes(normalizedDiet)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dietType. Allowed options: veg, non-veg, or egg.'
      });
    }

    // Validate allergies array
    let cleanedAllergies = [];
    if (Array.isArray(allergies)) {
      cleanedAllergies = allergies.map((a) => a.toString().trim()).filter(Boolean);
    }

    // Validate notes (max 500 characters)
    const cleanedNotes = (notes || '').toString().trim();
    if (cleanedNotes.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Notes for the kitchen must not exceed 500 characters.'
      });
    }

    const updated = await prisma.studentPreference.upsert({
      where: { userId },
      update: {
        dietType: normalizedDiet,
        allergies: cleanedAllergies,
        notes: cleanedNotes
      },
      create: {
        userId,
        dietType: normalizedDiet,
        allergies: cleanedAllergies,
        notes: cleanedNotes
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Food preferences saved successfully.',
      preferences: {
        dietType: updated.dietType,
        allergies: updated.allergies,
        notes: updated.notes
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /me/notifications or /api/student/notifications
 * @desc    Get user notifications and alerts (booking confirm/cancel alerts, closure notices, dues)
 */
const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const today = getCurrentDateIST();

    // Fetch existing stored notifications
    let notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    // If no notifications exist yet for student, generate initial welcome & status alerts
    if (notifications.length === 0) {
      const initialAlerts = [
        {
          userId,
          type: 'BOOKING_CONFIRMED',
          title: 'Daily Meal Booking Confirmed',
          message: `Your meal bookings for ${today} are active and confirmed. View your QR codes on the dashboard.`,
          priority: 'normal'
        },
        {
          userId,
          type: 'SYSTEM_ALERT',
          title: 'Cutoff Timing Notice',
          message: 'Lunch booking cutoff is strictly 10:30 AM and Dinner cutoff is 05:30 PM. Cancellations must be made before cutoffs.',
          priority: 'low'
        }
      ];

      // Check upcoming closures
      const upcomingClosure = await prisma.messClosure.findFirst({
        where: { date: { gte: today } },
        orderBy: { date: 'asc' }
      });
      if (upcomingClosure) {
        initialAlerts.unshift({
          userId,
          type: 'MESS_CLOSED',
          title: 'Mess Closure Notice',
          message: `Mess closure scheduled on ${upcomingClosure.date} (${upcomingClosure.mealType || 'ALL MEALS'}): ${upcomingClosure.reason}`,
          priority: 'high'
        });
      }

      await prisma.notification.createMany({
        data: initialAlerts
      });

      notifications = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
      });
    }

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return res.status(200).json({
      success: true,
      unreadCount,
      notifications
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PATCH /me/notifications/:id/read or /api/student/notifications/:id/read
 * @desc    Mark a single notification as read
 */
const markNotificationAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id);

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification || notification.userId !== userId) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read.',
      notification: updated
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /me/notifications/read-all or /api/student/notifications/read-all
 * @desc    Mark all user notifications as read
 */
const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read.'
    });
  } catch (err) {
    next(err);
  }
};

const getDayMeals = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const date = (req.query.date || getCurrentDateIST()).toString().trim();

    await ensureDefaultBookingsForDate(userId, date);

    const [schedules, overrides, closures, bookings] = await Promise.all([
      prisma.mealSchedule.findMany(),
      prisma.mealScheduleOverride.findMany({ where: { date } }),
      prisma.messClosure.findMany({ where: { date } }),
      prisma.mealBooking.findMany({ where: { userId, date } })
    ]);

    const timingFor = (type) => {
      const base = schedules.find((s) => s.mealType === type);
      const o = overrides.find((x) => x.mealType === type);
      return {
        cutoffTime: o?.cutoffTime || base?.cutoffTime || null,
        serviceStartTime: o?.serviceStartTime || base?.serviceStartTime || null,
        serviceEndTime: o?.serviceEndTime || base?.serviceEndTime || null
      };
    };

    const entireClosed = closures.some((c) => c.mealType === null);
    const order = { BREAKFAST: 0, LUNCH: 1, DINNER: 2 };

    const meals = bookings
      .sort((a, b) => order[a.mealType] - order[b.mealType])
      .map((b) => {
        const t = timingFor(b.mealType);
        const timingMissing = !t.cutoffTime || !t.serviceStartTime || !t.serviceEndTime;
        const isClosed = entireClosed || closures.some((c) => c.mealType === b.mealType);
        return {
          id: b.id,
          date: b.date,
          mealType: b.mealType,
          status: b.status,
          bookingCode: b.bookingCode,
          redeemedAt: b.redeemedAt,
          ...t,
          timingMissing,                       // spec 8.4: never guess a missing timing
          cutoffPassed: timingMissing ? true : isCutoffPassed(b.date, t.cutoffTime),
          isClosed,
          closureNotice: isClosed ? 'UNAVAILABLE — MESS CLOSED' : null
        };
      });

    return res.status(200).json({ success: true, serverNow: getServerNowIST(), date, meals });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getDashboard,
  getBookings,
  getBookingHistory,
  getStudentMeals,
  getDayMeals,
  getPreferences,
  updatePreferences,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  cancelMeal,
  restoreMeal,
  applyLeave,
  getLeaves,
  cancelLeave,
  getMealQr,
  getBilling,
  ensureDefaultBookingsForDate
};

