/**
 * Time utility functions to ensure all cutoff and service-window checks
 * use the institute's timezone (Asia/Kolkata) as strictly specified in section 8.5.
 */

const TIMEZONE = process.env.COLLEGE_TIMEZONE || 'Asia/Kolkata';

// Get current date string (YYYY-MM-DD) in College Timezone
function getCurrentDateIST() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now); // en-CA returns YYYY-MM-DD
}

// Get current time string (HH:mm) in College Timezone (24-hour)
function getCurrentTimeIST() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return formatter.format(now);
}

// Convert "HH:mm" to minutes since start of day
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Checks if the booking cutoff for a given meal and date has already passed.
 * Returns true if cutoff passed (meaning actions like cancelling are locked).
 */
function isCutoffPassed(mealDateStr, cutoffTimeStr) {
  const currentDate = getCurrentDateIST();

  if (mealDateStr < currentDate) {
    return true; // Past date, cutoff definitely passed
  }
  if (mealDateStr > currentDate) {
    return false; // Future date, cutoff hasn't passed
  }

  // Same day: compare time
  const currentTime = getCurrentTimeIST();
  return timeToMinutes(currentTime) >= timeToMinutes(cutoffTimeStr);
}

/**
 * Checks if current time is within the meal's service window (when QR can be scanned).
 */
function isWithinServiceWindow(mealDateStr, startTimeStr, endTimeStr) {
  const currentDate = getCurrentDateIST();
  if (mealDateStr !== currentDate) {
    return false; // Meal QR can only be redeemed on the meal's day
  }

  const currentTime = getCurrentTimeIST();
  const currentMins = timeToMinutes(currentTime);
  const startMins = timeToMinutes(startTimeStr);
  const endMins = timeToMinutes(endTimeStr);

  return currentMins >= startMins && currentMins <= endMins;
}

/**
 * Checks if the meal's service window has already ended for that day.
 */
function isServiceExpired(mealDateStr, endTimeStr) {
  const currentDate = getCurrentDateIST();
  if (mealDateStr < currentDate) return true;
  if (mealDateStr > currentDate) return false;

  const currentTime = getCurrentTimeIST();
  return timeToMinutes(currentTime) > timeToMinutes(endTimeStr);
}

/**
 * Generate inclusive array of YYYY-MM-DD dates between start and end date.
 */
function getDateRangeArray(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);

  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

// Get ISO timestamp string with timezone offset (e.g. "2026-10-26T16:55:00+05:30")
function getServerNowIST() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const map = {};
  parts.forEach((p) => (map[p.type] = p.value));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}+05:30`;
}

module.exports = {
  TIMEZONE,
  getCurrentDateIST,
  getCurrentTimeIST,
  getServerNowIST,
  isCutoffPassed,
  isWithinServiceWindow,
  isServiceExpired,
  getDateRangeArray
};

