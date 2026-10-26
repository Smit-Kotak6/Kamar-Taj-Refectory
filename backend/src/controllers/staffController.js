const prisma = require('../config/db');
const {
  getCurrentDateIST,
  isWithinServiceWindow,
  isServiceExpired
} = require('../utils/timeUtils');

/**
 * @route   POST /api/staff/verify-redeem
 * @desc    Atomic QR code / manual booking code verification & redemption (Section 9)
 */
const verifyAndRedeem = async (req, res, next) => {
  try {
    const staffId = req.user.id;
    const { token, bookingCode, code } = req.body;
    const inputCode = (token || bookingCode || code || '').toString().trim();

    if (!inputCode) {
      return res.status(400).json({
        success: false,
        message: 'A valid QR token or manual booking code is required.'
      });
    }

    const today = getCurrentDateIST();

    // 1. Fetch booking by matching either qrToken OR manual bookingCode (case-insensitive for manual entry)
    const booking = await prisma.mealBooking.findFirst({
      where: {
        OR: [
          { qrToken: inputCode },
          { bookingCode: inputCode.toUpperCase() }
        ]
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            regNo: true,
            roomNo: true,
            membership: true
          }
        }
      }
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Invalid booking code or token: No corresponding meal booking found.'
      });
    }

    // 2. Check Date (Section 9.4: Meal date check)
    if (booking.date !== today) {
      return res.status(400).json({
        success: false,
        message: `Date mismatch: This booking is for date ${booking.date}, but today is ${today}.`
      });
    }

    // 3. Check Previous Redemption Status (Duplicate Prevention - Section 9.5)
    if (booking.status === 'REDEEMED') {
      return res.status(409).json({
        success: false,
        message: `DUPLICATE REDEMPTION ATTEMPT: Meal already redeemed at ${booking.redeemedAt?.toLocaleTimeString() || 'earlier today'}.`
      });
    }

    // 4. Check Cancellation / Closure Status
    if (booking.status === 'CANCELLED_BY_STUDENT') {
      return res.status(400).json({
        success: false,
        message: 'Invalid: This meal was cancelled by the student.'
      });
    }
    if (booking.status === 'CANCELLED_LEAVE') {
      return res.status(400).json({
        success: false,
        message: 'Invalid: Student is registered on leave for this date.'
      });
    }
    if (booking.status === 'CANCELLED_MESS_CLOSED') {
      return res.status(400).json({
        success: false,
        message: 'Invalid: This meal was marked closed by mess administration.'
      });
    }

    // 5. Check Membership Active Status (Section 9.4)
    if (!booking.user.membership || !booking.user.membership.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Verification failed: Student mess membership is currently inactive or expired.'
      });
    }

    // 6. Check Meal Timings & Service Window (Section 9.2)
    const override = await prisma.mealScheduleOverride.findUnique({
      where: { date_mealType: { date: today, mealType: booking.mealType } }
    });
    const defaultSchedule = await prisma.mealSchedule.findUnique({
      where: { mealType: booking.mealType }
    });

    const serviceStartTime = override?.serviceStartTime || defaultSchedule?.serviceStartTime || '12:00';
    const serviceEndTime = override?.serviceEndTime || defaultSchedule?.serviceEndTime || '14:30';

    if (isServiceExpired(today, serviceEndTime)) {
      return res.status(400).json({
        success: false,
        message: `QR code expired: The service window for ${booking.mealType} ended at ${serviceEndTime}.`
      });
    }

    // Note: If you want strict window adherence (only during service time):
    // if (!isWithinServiceWindow(today, serviceStartTime, serviceEndTime)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: `Service window is ${serviceStartTime} - ${serviceEndTime}. Scanning outside this window is not permitted.`
    //   });
    // }

    // 7. Atomic Redemption using a Transaction with Status condition (Section 9.5)
    // Ensures concurrent duplicate requests cannot double-redeem
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      // Re-check status inside transaction
      const current = await tx.mealBooking.findUnique({
        where: { id: booking.id }
      });

      if (current.status === 'REDEEMED') {
        throw new Error('DUPLICATE_REDEEM');
      }

      return tx.mealBooking.update({
        where: { id: booking.id },
        data: {
          status: 'REDEEMED',
          redeemedAt: now,
          redeemedById: staffId
        }
      });
    });

    return res.status(200).json({
      success: true,
      message: `Verified successfully! ${booking.mealType} meal granted to ${booking.user.name}.`,
      data: {
        studentName: booking.user.name,
        regNo: booking.user.regNo,
        roomNo: booking.user.roomNo,
        mealType: booking.mealType,
        bookingCode: booking.bookingCode,
        redeemedAt: updated.redeemedAt
      }
    });
  } catch (err) {
    if (err.message === 'DUPLICATE_REDEEM') {
      return res.status(409).json({
        success: false,
        message: 'DUPLICATE REDEMPTION: This meal booking was already redeemed in a parallel request.'
      });
    }
    next(err);
  }
};

/**
 * @route   GET /api/staff/stats
 * @desc    View consumption counts for today's meals (Section 4.2 & 13)
 */
const getStaffStats = async (req, res, next) => {
  try {
    const today = getCurrentDateIST();

    const bookings = await prisma.mealBooking.findMany({
      where: { date: today }
    });

    const stats = {
      date: today,
      BREAKFAST: { total: 0, redeemed: 0, cancelled: 0 },
      LUNCH: { total: 0, redeemed: 0, cancelled: 0 },
      DINNER: { total: 0, redeemed: 0, cancelled: 0 }
    };

    bookings.forEach((b) => {
      if (stats[b.mealType]) {
        stats[b.mealType].total++;
        if (b.status === 'REDEEMED') stats[b.mealType].redeemed++;
        if (b.status.startsWith('CANCELLED')) stats[b.mealType].cancelled++;
      }
    });

    return res.status(200).json({
      success: true,
      stats
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  verifyAndRedeem,
  getStaffStats
};
