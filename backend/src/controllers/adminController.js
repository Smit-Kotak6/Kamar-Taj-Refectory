const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { getCurrentDateIST } = require('../utils/timeUtils');
const { isValidMnnitEmail } = require('./authController');

/**
 * @route   POST /api/admin/users
 * @desc    Create a staff or admin account (Section 4.3 & 16.4)
 */
const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, regNo, roomNo, phone } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, password, and role are required.'
      });
    }

    if (!['STUDENT', 'STAFF', 'ADMIN'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Permitted roles are STUDENT, STAFF, or ADMIN.'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidMnnitEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Email must end with @mnnit.ac.in'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role,
        regNo: regNo ? regNo.trim() : null,
        roomNo: roomNo ? roomNo.trim() : null,
        phone: phone ? phone.trim() : null,
        // If student, initialize membership
        membership: role === 'STUDENT' ? {
          create: {
            startDate: new Date(),
            endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
            isActive: true
          }
        } : undefined
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        regNo: true,
        roomNo: true,
        membership: true,
        createdAt: true
      }
    });

    return res.status(201).json({
      success: true,
      message: `Account created successfully with role ${role}.`,
      user
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/admin/users
 * @desc    List all users with optional role filtering
 */
const getUsers = async (req, res, next) => {
  try {
    const { role } = req.query;

    const where = {};
    if (role && ['STUDENT', 'STAFF', 'ADMIN'].includes(role.toUpperCase())) {
      where.role = role.toUpperCase();
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        regNo: true,
        roomNo: true,
        phone: true,
        membership: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, count: users.length, users });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   PUT /api/admin/membership/:userId
 * @desc    Manage student mess membership dates & active status (Section 5)
 */
const updateMembership = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.userId);
    const { isActive, startDate, endDate } = req.body;

    const data = {};
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);

    const membership = await prisma.studentMembership.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        isActive: isActive !== undefined ? isActive : true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Student membership updated successfully.',
      membership
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/admin/closures
 * @desc    Mark a specific meal or the entire mess as closed (Section 10)
 */
const closeMealOrMess = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { date, mealType, reason } = req.body;

    if (!date || !reason) {
      return res.status(400).json({
        success: false,
        message: 'date (YYYY-MM-DD) and reason are required.'
      });
    }

    if (mealType && !['BREAKFAST', 'LUNCH', 'DINNER'].includes(mealType)) {
      return res.status(400).json({
        success: false,
        message: 'mealType must be BREAKFAST, LUNCH, DINNER, or omitted for entire mess closure.'
      });
    }

    // Save closure record
    const closure = await prisma.messClosure.upsert({
      where: {
        date_mealType: {
          date,
          mealType: mealType || null
        }
      },
      update: { reason, closedBy: adminId },
      create: {
        date,
        mealType: mealType || null,
        reason,
        closedBy: adminId
      }
    });

    // Automatically update affected existing bookings to CANCELLED_MESS_CLOSED (Section 10.4)
    const bookingFilter = {
      date,
      status: { in: ['BOOKED'] }
    };
    if (mealType) {
      bookingFilter.mealType = mealType;
    }

    const affected = await prisma.mealBooking.updateMany({
      where: bookingFilter,
      data: { status: 'CANCELLED_MESS_CLOSED' }
    });

    return res.status(200).json({
      success: true,
      message: `Closure registered for ${date} (${mealType || 'ENTIRE MESS'}). ${affected.count} active bookings marked as Cancelled — Mess Closed.`,
      closure
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/admin/closures
 * @desc    List all mess closures
 */
const getClosures = async (req, res, next) => {
  try {
    const closures = await prisma.messClosure.findMany({
      orderBy: { date: 'desc' }
    });
    return res.status(200).json({ success: true, closures });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/admin/timings
 * @desc    Configure default meal timings or date-specific overrides (Section 8)
 */
const setMealTiming = async (req, res, next) => {
  try {
    const { mealType, cutoffTime, serviceStartTime, serviceEndTime, date } = req.body;

    if (!mealType || !cutoffTime || !serviceStartTime || !serviceEndTime) {
      return res.status(400).json({
        success: false,
        message: 'mealType, cutoffTime, serviceStartTime, and serviceEndTime (HH:mm) are required.'
      });
    }

    if (date) {
      // Date-specific override (Section 8.3)
      const override = await prisma.mealScheduleOverride.upsert({
        where: { date_mealType: { date, mealType } },
        update: { cutoffTime, serviceStartTime, serviceEndTime },
        create: { date, mealType, cutoffTime, serviceStartTime, serviceEndTime }
      });
      return res.status(200).json({
        success: true,
        message: `Date-specific override saved for ${mealType} on ${date}.`,
        override
      });
    } else {
      // Default timing
      const schedule = await prisma.mealSchedule.upsert({
        where: { mealType },
        update: { cutoffTime, serviceStartTime, serviceEndTime },
        create: { mealType, cutoffTime, serviceStartTime, serviceEndTime }
      });
      return res.status(200).json({
        success: true,
        message: `Default timing saved for ${mealType}.`,
        schedule
      });
    }
  } catch (err) {
    next(err);
  }
};

/**
 * @route   POST /api/admin/billing/record-payment
 * @desc    Record offline fee payment for a student (Section 12)
 */
const recordPayment = async (req, res, next) => {
  try {
    const { userId, month, amount, notes } = req.body;

    if (!userId || !month || amount === undefined) {
      return res.status(400).json({
        success: false,
        message: 'userId, month (YYYY-MM), and amount are required.'
      });
    }

    const payAmount = parseFloat(amount);

    const bill = await prisma.billingRecord.findUnique({
      where: { userId_month: { userId: parseInt(userId), month } }
    });

    const currentTotal = bill ? bill.totalAmount : 3500.0;
    const currentPaid = bill ? bill.paidAmount : 0.0;
    const newPaid = currentPaid + payAmount;
    const newStatus = newPaid >= currentTotal ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

    const updatedBill = await prisma.billingRecord.upsert({
      where: { userId_month: { userId: parseInt(userId), month } },
      update: {
        paidAmount: newPaid,
        status: newStatus,
        notes: notes || bill?.notes
      },
      create: {
        userId: parseInt(userId),
        month,
        totalAmount: currentTotal,
        paidAmount: newPaid,
        status: newStatus,
        notes
      }
    });

    return res.status(200).json({
      success: true,
      message: `Offline payment of ₹${payAmount} recorded successfully. Current status: ${newStatus}.`,
      bill: updatedBill
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/admin/reports
 * @desc    Comprehensive consumption & booking report (Section 13)
 */
const getReports = async (req, res, next) => {
  try {
    const date = req.query.date || getCurrentDateIST();

    const bookings = await prisma.mealBooking.findMany({
      where: { date },
      include: {
        user: { select: { id: true, name: true, regNo: true } }
      }
    });

    const summary = {
      date,
      totalBookings: bookings.length,
      BREAKFAST: { booked: 0, redeemed: 0, cancelledStudent: 0, cancelledLeave: 0, cancelledClosed: 0, unconsumed: 0 },
      LUNCH: { booked: 0, redeemed: 0, cancelledStudent: 0, cancelledLeave: 0, cancelledClosed: 0, unconsumed: 0 },
      DINNER: { booked: 0, redeemed: 0, cancelledStudent: 0, cancelledLeave: 0, cancelledClosed: 0, unconsumed: 0 }
    };

    bookings.forEach((b) => {
      const bucket = summary[b.mealType];
      if (!bucket) return;

      if (b.status === 'BOOKED') bucket.booked++;
      else if (b.status === 'REDEEMED') bucket.redeemed++;
      else if (b.status === 'CANCELLED_BY_STUDENT') bucket.cancelledStudent++;
      else if (b.status === 'CANCELLED_LEAVE') bucket.cancelledLeave++;
      else if (b.status === 'CANCELLED_MESS_CLOSED') bucket.cancelledClosed++;
      else if (b.status === 'UNCONSUMED') bucket.unconsumed++;
    });

    return res.status(200).json({
      success: true,
      report: summary,
      bookingsSample: bookings.slice(0, 50)
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createUser,
  getUsers,
  updateMembership,
  closeMealOrMess,
  getClosures,
  setMealTiming,
  recordPayment,
  getReports
};
