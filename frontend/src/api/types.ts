// src/api/types.ts
// Shared types (and a few tiny constants) for The Kamar-Taj Refectory.
// Dates are 'YYYY-MM-DD' (local calendar day). Timestamps are ISO-8601 strings.

export type Role = 'student' | 'staff' | 'admin' | 'superadmin';

export type MealType = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

export type BookingStatus =
  | 'BOOKED'
  | 'LOCKED'
  | 'REDEEMED'
  | 'EXPIRED_UNCONSUMED'
  | 'CANCELLED_BY_STUDENT'
  | 'ON_LEAVE'
  | 'CANCELLED_MESS_CLOSED';

/** Closed meals must always show this exact text. */
export const MESS_CLOSED_LABEL = 'UNAVAILABLE — MESS CLOSED';

/** Human-friendly labels for each booking status. */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  BOOKED: 'Booked',
  LOCKED: 'Locked',
  REDEEMED: 'Redeemed',
  EXPIRED_UNCONSUMED: 'Expired (not eaten)',
  CANCELLED_BY_STUDENT: 'Cancelled by you',
  ON_LEAVE: 'On leave',
  CANCELLED_MESS_CLOSED: MESS_CLOSED_LABEL,
};

// ---------------------------------------------------------------- errors

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'MESS_CLOSED'
  | 'ON_LEAVE'
  | 'CUTOFF_PASSED'
  | 'NOT_ELIGIBLE';

/** Thrown by every API function on failure. A real backend can map HTTP errors onto this. */
export class ApiError extends Error {
  code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

// ----------------------------------------------------------------- meals

export interface Meal {
  /** `${date}_${type}`, e.g. "2026-10-24_lunch" */
  id: string;
  type: MealType;
  /** 'YYYY-MM-DD' */
  date: string;
  title: string;
  description: string;
  kcal: number;
  tags: string[];
  /** Image URL (the mock uses inline SVG data URIs). */
  image: string;
  /** ISO timestamps */
  serviceStart: string;
  serviceEnd: string;
  /** Last moment the student can book / cancel. */
  cutoffAt: string;
  /** The current student's booking status for this meal. */
  status: BookingStatus;
  /** True when the mess is closed for this meal (UI must show MESS_CLOSED_LABEL). */
  closed: boolean;
}

// ----------------------------------------------------------------- leave

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  mealTypes: MealType[];
  reason: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
}

export interface CreateLeaveInput {
  startDate: string;
  endDate: string;
  mealTypes: MealType[];
  reason?: string;
}

// -------------------------------------------------------------------- QR

export interface QrToken {
  token: string;
  /** ISO timestamp, 30 seconds after issue. */
  expiresAt: string;
  /** Short manual-entry code (last segment of the token) for staff to type if scanning fails. */
  code?: string;
}

export type RedeemOutcome =
  | 'valid'
  | 'expired'
  | 'already_redeemed'
  | 'closed'
  | 'not_eligible';

export interface RedeemResult {
  outcome: RedeemOutcome;
  message: string;
  studentName?: string;
  studentId?: string;
  mealType?: MealType;
  mealTitle?: string;
  date?: string;
  redeemedAt?: string;
}

// --------------------------------------------------------------- billing

export interface BillingItem {
  id: string;
  date: string;
  mealType: MealType;
  title: string;
  /** List price in INR for this meal. */
  amount: number;
  /** false = not billed (cancelled, on leave, or mess closed). */
  charged: boolean;
  status: BookingStatus;
}

export type RebateReason = 'ON_LEAVE' | 'MESS_CLOSED' | 'CANCELLED_BEFORE_CUTOFF';

export interface RebateEntry {
  id: string;
  date: string;
  mealType: MealType;
  reason: RebateReason;
  /** INR */
  amount: number;
  /** Always "Demo policy" until the real rebate policy is defined. */
  policyLabel: string;
  note: string;
  status: 'CREDITED' | 'PENDING';
}

// ----------------------------------------------------------- preferences

export type Diet = 'veg' | 'non-veg' | 'eggetarian';

export interface Preferences {
  diet: Diet;
  allergies: string[];
  notes: string;
  reminderEnabled: boolean;
  /** Minutes before a cutoff to remind the student. */
  reminderMinutes: number;
}

// --------------------------------------------------------- notifications

export type NotificationKind = 'info' | 'success' | 'warning' | 'danger';

export interface Notification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

// ------------------------------------------------------ admin analytics

export interface ForecastPoint {
  date: string;
  mealType: MealType;
  /** Predicted head-count (draw as the dashed line). */
  predicted: number;
  /** Actual head-count; null for today-onwards. */
  actual: number | null;
}

export interface WasteStat {
  date: string;
  mealType: MealType;
  preparedKg: number;
  consumedKg: number;
  wastedKg: number;
  /** wastedKg / preparedKg * 100, one decimal. */
  wastePct: number;
}

export interface AdminMealStat {
  mealType: MealType;
  booked: number;
  redeemed: number;
  closed: boolean;
  cutoffAt: string;
  /** Booked head-count vs the same meal one week ago, in percent. */
  trendPct: number;
}

export interface AdminOverview {
  date: string;
  totalStudents: number;
  onLeave: number;
  meals: AdminMealStat[];
  /** Waste over the last 7 days, in percent. */
  avgWastePct: number;
  /** Change in waste % vs the previous 7 days, in percentage points. */
  wasteTrendPct: number;
  /** Total bookings today vs the same day last week, in percent. */
  bookedTrendPct: number;
}

// --------------------------------------------------------------- timings

export interface TimingTimes {
  /** 'HH:mm' 24-hour */
  cutoff: string;
  serviceStart: string;
  serviceEnd: string;
}

export interface Timing extends TimingTimes {
  mealType: MealType;
  /** true if a date-specific override is applied. */
  overridden: boolean;
}

export interface TimingOverride extends TimingTimes {
  mealType: MealType;
  /** 'YYYY-MM-DD'. If omitted, the change becomes the new default for every day. */
  date?: string;
}