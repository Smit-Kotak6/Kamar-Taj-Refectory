// src/api/mock.ts
// In-memory "fake backend" for The Kamar-Taj Refectory.
// Everything here is synchronous; src/api/index.ts wraps it in async functions with a small delay.
// When a real backend exists, replace the bodies in index.ts with fetch calls and delete this file.

import { ApiError, MEAL_TYPES, MESS_CLOSED_LABEL } from './types';
import type {
  AdminOverview,
  BillingItem,
  BookingStatus,
  CreateLeaveInput,
  ForecastPoint,
  LeaveRequest,
  Meal,
  MealType,
  Notification,
  Preferences,
  QrToken,
  RebateEntry,
  RedeemResult,
  Timing,
  TimingOverride,
  TimingTimes,
  WasteStat,
} from './types';

// ------------------------------------------------------------ demo config

/** Flip these while demoing. */
export const DEMO = {
  /** false = staff can redeem a valid QR at any time of day. true = only inside the service window. */
  enforceServiceWindow: false,
};

export const STUDENT = { id: '2023CS1042', name: 'Aarav Sharma' };

const TOTAL_STUDENTS = 640;
const QR_TTL_MS = 30_000;

/** INR per meal. */
const MEAL_RATE: Record<MealType, number> = { breakfast: 35, lunch: 70, dinner: 65 };
const HEADCOUNT_BASE: Record<MealType, number> = { breakfast: 430, lunch: 560, dinner: 520 };
const KG_PER_PLATE: Record<MealType, number> = { breakfast: 0.3, lunch: 0.5, dinner: 0.45 };

// Temporary timings (24-hour 'HH:mm'). Cutoffs are on the same day as the meal.
const timingDefaults: Record<MealType, TimingTimes> = {
  breakfast: { cutoff: '07:00', serviceStart: '07:30', serviceEnd: '09:30' },
  lunch: { cutoff: '10:30', serviceStart: '12:30', serviceEnd: '14:30' },
  dinner: { cutoff: '17:30', serviceStart: '19:30', serviceEnd: '21:30' },
};

// ----------------------------------------------------------------- menu

interface MenuItem {
  title: string;
  description: string;
  kcal: number;
  tags: string[];
  emoji: string;
}

const BREAKFASTS: MenuItem[] = [
  {
    title: 'Poha',
    description: 'Flattened rice tempered with mustard, curry leaves, peanuts and lemon, topped with sev. Served with hot chai.',
    kcal: 320,
    tags: ['veg', 'light'],
    emoji: '🥣',
  },
  {
    title: 'Idli Sambar',
    description: 'Soft steamed idlis with piping hot sambar and coconut chutney.',
    kcal: 350,
    tags: ['veg', 'south-indian', 'steamed'],
    emoji: '🍚',
  },
  {
    title: 'Aloo Paratha',
    description: 'Stuffed potato flatbread cooked on the tawa, served with curd and pickle.',
    kcal: 430,
    tags: ['veg', 'north-indian', 'hearty'],
    emoji: '🫓',
  },
  {
    title: 'Upma',
    description: 'Roasted semolina cooked with onions, carrots, peas and cashews. Served with coconut chutney.',
    kcal: 300,
    tags: ['veg', 'light'],
    emoji: '🍲',
  },
];

const LUNCH: MenuItem = {
  title: 'Dal Tadka, Rice & Mix Veg',
  description: 'Dal Tadka, steamed rice, seasonal mix veg, fresh rotis and a crunchy salad.',
  kcal: 720,
  tags: ['veg', 'thali', 'high-protein'],
  emoji: '🍛',
};

const DINNER: MenuItem = {
  title: 'Paneer Curry, Roti & Rice',
  description: 'Creamy paneer curry with fresh rotis, steamed rice and a side salad.',
  kcal: 680,
  tags: ['veg', 'paneer', 'high-protein'],
  emoji: '🍽️',
};

const THUMB_COLORS: Record<MealType, [string, string]> = {
  breakfast: ['#FDE3D6', '#FFF1E6'],
  lunch: ['#E3F4EA', '#F3FBF6'],
  dinner: ['#EEE9FD', '#F7F4FF'],
};

function thumb(emoji: string, type: MealType): string {
  const [c1, c2] = THUMB_COLORS[type];
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='200' viewBox='0 0 320 200'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs>` +
    `<rect width='320' height='200' fill='url(#g)'/>` +
    `<text x='160' y='125' font-size='88' text-anchor='middle'>${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function menuFor(date: string, type: MealType): MenuItem {
  if (type === 'lunch') return LUNCH;
  if (type === 'dinner') return DINNER;
  const [y, m, d] = date.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return BREAKFASTS[dayNumber % BREAKFASTS.length];
}

// --------------------------------------------------------- date helpers

const pad = (n: number) => String(n).padStart(2, '0');
const round1 = (n: number) => Math.round(n * 10) / 10;

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr(): string {
  return toDateStr(new Date());
}

function isDateStr(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function assertDate(value: string): void {
  if (!isDateStr(value)) throw new ApiError('BAD_REQUEST', `Invalid date: ${value}`);
}

function assertMealType(value: string): MealType {
  if (!MEAL_TYPES.includes(value as MealType)) throw new ApiError('BAD_REQUEST', `Invalid meal type: ${value}`);
  return value as MealType;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

function atTime(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0);
}

function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function formatDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Deterministic pseudo-random numbers so charts look the same on every reload.
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(key: string): number {
  return hash(key) / 4294967296;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------------------------------------------------------------- state

type ExplicitBooking = 'BOOKED' | 'CANCELLED_BY_STUDENT' | 'REDEEMED';

const bookingOverrides = new Map<string, ExplicitBooking>(); // mealId -> explicit state
const redeemedAt = new Map<string, string>(); // mealId -> ISO time
const closures = new Set<string>(); // mealIds that are closed
const timingByDate = new Map<string, TimingTimes>(); // `${date}_${type}` -> override
const issuedTokens = new Map<string, { mealId: string; expiresAt: number }>();
let leaves: LeaveRequest[] = [];
let notifications: Notification[] = [];
let preferences: Preferences = {
  diet: 'veg',
  allergies: [],
  notes: '',
  reminderEnabled: true,
  reminderMinutes: 30,
};
let idCounter = 1;

const nextId = (prefix: string) => `${prefix}_${idCounter++}`;
const mealIdOf = (date: string, type: MealType) => `${date}_${type}`;

function pushNotification(kind: Notification['kind'], title: string, body: string): void {
  notifications.unshift({ id: nextId('n'), kind, title, body, createdAt: new Date().toISOString(), read: false });
}

// ------------------------------------------------------- meal building

function timingsFor(date: string, type: MealType): TimingTimes {
  return timingByDate.get(mealIdOf(date, type)) ?? timingDefaults[type];
}

function serviceWindow(date: string, type: MealType) {
  const t = timingsFor(date, type);
  return {
    cutoff: atTime(date, t.cutoff),
    start: atTime(date, t.serviceStart),
    end: atTime(date, t.serviceEnd),
  };
}

function isOnLeave(date: string, type: MealType, cutoff: Date): boolean {
  return leaves.some(
    (l) =>
      l.status === 'ACTIVE' &&
      l.startDate <= date &&
      date <= l.endDate &&
      l.mealTypes.includes(type) &&
      new Date(l.createdAt) < cutoff, // a leave created after the cutoff cannot affect that meal
  );
}

function resolveStatus(id: string, date: string, type: MealType, cutoff: Date, end: Date): BookingStatus {
  const explicit = bookingOverrides.get(id);
  if (explicit === 'REDEEMED') return 'REDEEMED';
  if (closures.has(id)) return 'CANCELLED_MESS_CLOSED';
  if (isOnLeave(date, type, cutoff)) return 'ON_LEAVE';
  if (explicit === 'CANCELLED_BY_STUDENT') return 'CANCELLED_BY_STUDENT';
  const now = Date.now();
  if (now > end.getTime()) {
    // Past meals that were booked: most were eaten, a few were not.
    return seeded(`eaten${id}`) < 0.88 ? 'REDEEMED' : 'EXPIRED_UNCONSUMED';
  }
  if (now >= cutoff.getTime()) return 'LOCKED';
  return 'BOOKED';
}

function buildMeal(date: string, type: MealType): Meal {
  const id = mealIdOf(date, type);
  const w = serviceWindow(date, type);
  const item = menuFor(date, type);
  const status = resolveStatus(id, date, type, w.cutoff, w.end);
  return {
    id,
    type,
    date,
    title: item.title,
    description: item.description,
    kcal: item.kcal,
    tags: [...item.tags],
    image: thumb(item.emoji, type),
    serviceStart: w.start.toISOString(),
    serviceEnd: w.end.toISOString(),
    cutoffAt: w.cutoff.toISOString(),
    status,
    closed: status === 'CANCELLED_MESS_CLOSED',
  };
}

function parseMealId(mealId: string): { date: string; type: MealType } {
  const [date, type] = mealId.split('_');
  if (!isDateStr(date) || !MEAL_TYPES.includes(type as MealType)) {
    throw new ApiError('NOT_FOUND', `Unknown meal: ${mealId}`);
  }
  return { date, type: type as MealType };
}

function findMeal(mealId: string): Meal {
  const { date, type } = parseMealId(mealId);
  return buildMeal(date, type);
}

// -------------------------------------------------------------- meals API

export function getMeals(date: string): Meal[] {
  assertDate(date);
  return MEAL_TYPES.map((type) => buildMeal(date, type));
}

export function setMealBooking(mealId: string, booked: boolean): Meal {
  const meal = findMeal(mealId);
  if (meal.closed) throw new ApiError('MESS_CLOSED', MESS_CLOSED_LABEL);
  if (meal.status === 'ON_LEAVE') {
    throw new ApiError('ON_LEAVE', 'You are on leave for this meal. Cancel the leave first.');
  }
  if (meal.status === 'LOCKED' || meal.status === 'REDEEMED' || meal.status === 'EXPIRED_UNCONSUMED') {
    throw new ApiError('CUTOFF_PASSED', 'The cutoff for this meal has passed.');
  }
  bookingOverrides.set(meal.id, booked ? 'BOOKED' : 'CANCELLED_BY_STUDENT');
  return findMeal(mealId);
}

// -------------------------------------------------------------- leave API

export function createLeave(input: CreateLeaveInput): LeaveRequest {
  assertDate(input.startDate);
  assertDate(input.endDate);
  const types = Array.from(new Set(input.mealTypes.map(assertMealType)));
  if (types.length === 0) throw new ApiError('BAD_REQUEST', 'Choose at least one meal.');
  if (input.endDate < input.startDate) throw new ApiError('BAD_REQUEST', 'End date cannot be before start date.');
  if (input.startDate < todayStr()) throw new ApiError('BAD_REQUEST', 'Leave cannot start in the past.');
  if (eachDate(input.startDate, input.endDate).length > 60) {
    throw new ApiError('BAD_REQUEST', 'Leave can be at most 60 days.');
  }
  const leave: LeaveRequest = {
    id: nextId('lv'),
    startDate: input.startDate,
    endDate: input.endDate,
    mealTypes: MEAL_TYPES.filter((t) => types.includes(t)),
    reason: (input.reason ?? '').trim(),
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
  leaves.push(leave);
  pushNotification(
    'success',
    'Leave confirmed',
    `${formatDay(leave.startDate)} to ${formatDay(leave.endDate)}: ${leave.mealTypes.join(', ')} bookings paused. Rebate applies (Demo policy).`,
  );
  return clone(leave);
}

export function getLeaves(): LeaveRequest[] {
  return clone([...leaves].sort((a, b) => (a.startDate < b.startDate ? 1 : -1)));
}

export function cancelLeave(leaveId: string): LeaveRequest {
  const leave = leaves.find((l) => l.id === leaveId);
  if (!leave) throw new ApiError('NOT_FOUND', 'Leave request not found.');
  if (leave.status === 'CANCELLED') return clone(leave);
  if (leave.endDate < todayStr()) throw new ApiError('BAD_REQUEST', 'This leave has already ended.');
  leave.status = 'CANCELLED';
  return clone(leave);
}

// ----------------------------------------------------------------- QR API

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

export function getQrToken(mealId: string): QrToken {
  const meal = findMeal(mealId);
  if (meal.closed) throw new ApiError('MESS_CLOSED', MESS_CLOSED_LABEL);
  if (meal.status === 'REDEEMED') throw new ApiError('NOT_ELIGIBLE', 'This meal has already been redeemed.');
  if (meal.status !== 'BOOKED' && meal.status !== 'LOCKED') {
    throw new ApiError('NOT_ELIGIBLE', 'You do not have an active booking for this meal.');
  }
  const code = randomCode(6);
  const token = `KT.${meal.id}.${code}`;
  const expiresAt = Date.now() + QR_TTL_MS;
  issuedTokens.set(token, { mealId: meal.id, expiresAt });
  // Forget tokens that expired more than an hour ago.
  for (const [key, value] of issuedTokens) {
    if (value.expiresAt < Date.now() - 3_600_000) issuedTokens.delete(key);
  }
  return { token, code, expiresAt: new Date(expiresAt).toISOString() };
}

export function redeem(tokenOrCode: string): RedeemResult {
  const input = tokenOrCode.trim();
  let token = input;
  if (!input.includes('.')) {
    // Manual entry: the short code is the last segment of the token.
    const code = input.toUpperCase();
    token = Array.from(issuedTokens.keys()).reverse().find((k) => k.endsWith(`.${code}`)) ?? '';
  }
  const issued = issuedTokens.get(token);
  if (!issued) return { outcome: 'not_eligible', message: 'Unrecognised QR or code.' };

  const { date, type } = parseMealId(issued.mealId);
  const meal = buildMeal(date, type);
  const info = {
    studentName: STUDENT.name,
    studentId: STUDENT.id,
    mealType: type,
    mealTitle: meal.title,
    date,
  };

  if (Date.now() > issued.expiresAt) {
    return { ...info, outcome: 'expired', message: 'QR expired. Ask the student to refresh it.' };
  }
  if (meal.closed) {
    return { ...info, outcome: 'closed', message: MESS_CLOSED_LABEL };
  }
  if (meal.status === 'REDEEMED') {
    return {
      ...info,
      outcome: 'already_redeemed',
      message: 'This meal was already redeemed.',
      redeemedAt: redeemedAt.get(meal.id),
    };
  }
  if (meal.status !== 'BOOKED' && meal.status !== 'LOCKED') {
    const reasons: Partial<Record<BookingStatus, string>> = {
      ON_LEAVE: 'Student is on approved leave for this meal.',
      CANCELLED_BY_STUDENT: 'Student cancelled this meal.',
      EXPIRED_UNCONSUMED: 'The service window for this meal has ended.',
    };
    return { ...info, outcome: 'not_eligible', message: reasons[meal.status] ?? 'Student is not eligible for this meal.' };
  }
  if (DEMO.enforceServiceWindow) {
    const now = Date.now();
    if (now < new Date(meal.serviceStart).getTime() || now > new Date(meal.serviceEnd).getTime()) {
      return { ...info, outcome: 'not_eligible', message: 'Outside the service window for this meal.' };
    }
  }

  const when = new Date().toISOString();
  bookingOverrides.set(meal.id, 'REDEEMED');
  redeemedAt.set(meal.id, when);
  return { ...info, outcome: 'valid', message: 'Valid. Enjoy your meal!', redeemedAt: when };
}

// ------------------------------------------------- billing & rebates API

export function getBilling(month?: string): BillingItem[] {
  const today = todayStr();
  const m = month ?? today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(m)) throw new ApiError('BAD_REQUEST', `Invalid month: ${m}`);

  const items: BillingItem[] = [];
  let date = `${m}-01`;
  while (date.slice(0, 7) === m && date <= today) {
    for (const type of MEAL_TYPES) {
      const meal = buildMeal(date, type);
      if (meal.status === 'BOOKED') continue; // cutoff not reached yet, nothing billed yet
      items.push({
        id: meal.id,
        date,
        mealType: type,
        title: meal.title,
        amount: MEAL_RATE[type],
        charged: meal.status === 'LOCKED' || meal.status === 'REDEEMED' || meal.status === 'EXPIRED_UNCONSUMED',
        status: meal.status,
      });
    }
    date = addDays(date, 1);
  }
  return items.sort((a, b) =>
    a.date === b.date ? MEAL_TYPES.indexOf(b.mealType) - MEAL_TYPES.indexOf(a.mealType) : a.date < b.date ? 1 : -1,
  );
}

export function getRebates(): RebateEntry[] {
  const today = todayStr();
  const entries: RebateEntry[] = [];
  for (const date of eachDate(addDays(today, -30), addDays(today, 14))) {
    for (const type of MEAL_TYPES) {
      const meal = buildMeal(date, type);
      let reason: RebateEntry['reason'] | null = null;
      let note = '';
      if (meal.status === 'ON_LEAVE') {
        reason = 'ON_LEAVE';
        note = 'Demo policy: full meal rate credited for approved leave.';
      } else if (meal.status === 'CANCELLED_MESS_CLOSED') {
        reason = 'MESS_CLOSED';
        note = 'Demo policy: full meal rate credited when the mess is closed.';
      } else if (meal.status === 'CANCELLED_BY_STUDENT') {
        reason = 'CANCELLED_BEFORE_CUTOFF';
        note = 'Demo policy: full meal rate credited for cancelling before the cutoff.';
      }
      if (!reason) continue;
      entries.push({
        id: `rb_${meal.id}`,
        date,
        mealType: type,
        reason,
        amount: MEAL_RATE[type],
        policyLabel: 'Demo policy',
        note,
        status: date <= today ? 'CREDITED' : 'PENDING',
      });
    }
  }
  return entries.sort((a, b) =>
    a.date === b.date ? MEAL_TYPES.indexOf(b.mealType) - MEAL_TYPES.indexOf(a.mealType) : a.date < b.date ? 1 : -1,
  );
}

// ------------------------------------------- preferences & notifications

export function getPreferences(): Preferences {
  return clone(preferences);
}

export function savePreferences(next: Preferences): Preferences {
  if (!['veg', 'non-veg', 'eggetarian'].includes(next.diet)) {
    throw new ApiError('BAD_REQUEST', `Invalid diet: ${next.diet}`);
  }
  const allergies = Array.from(new Set(next.allergies.map((a) => a.trim()).filter(Boolean)));
  preferences = {
    diet: next.diet,
    allergies,
    notes: next.notes.slice(0, 500),
    reminderEnabled: Boolean(next.reminderEnabled),
    reminderMinutes: Math.min(120, Math.max(5, Math.round(next.reminderMinutes))),
  };
  return clone(preferences);
}

export function getNotifications(): Notification[] {
  return clone([...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
}

// -------------------------------------------------- admin analytics API

/** Expected head-count if the mess is open. */
function demand(date: string, type: MealType): number {
  const dow = dayOfWeek(date);
  const factor = dow === 0 || dow === 6 ? 0.8 : 1;
  const noise = 0.92 + 0.16 * seeded(`h${date}${type}`);
  return Math.round(HEADCOUNT_BASE[type] * factor * noise);
}

function headcount(date: string, type: MealType): number {
  return closures.has(mealIdOf(date, type)) ? 0 : demand(date, type);
}

export function getForecast(mealType: MealType = 'lunch'): ForecastPoint[] {
  assertMealType(mealType);
  const today = todayStr();
  const points: ForecastPoint[] = [];
  for (let offset = -7; offset <= 7; offset++) {
    const date = addDays(today, offset);
    const base = headcount(date, mealType);
    points.push({
      date,
      mealType,
      predicted: Math.round(base * (0.95 + 0.1 * seeded(`p${date}${mealType}`))),
      actual: offset < 0 ? base : null,
    });
  }
  return points;
}

function wasteStat(date: string, type: MealType): WasteStat {
  const heads = headcount(date, type);
  const preparedKg = round1(heads * KG_PER_PLATE[type] * 1.12);
  const pct = heads === 0 ? 0 : 6 + 8 * seeded(`w${date}${type}`);
  const wastedKg = round1((preparedKg * pct) / 100);
  return {
    date,
    mealType: type,
    preparedKg,
    consumedKg: round1(preparedKg - wastedKg),
    wastedKg,
    wastePct: preparedKg === 0 ? 0 : round1((wastedKg / preparedKg) * 100),
  };
}

export function getWasteStats(days: number = 7): WasteStat[] {
  const n = Math.min(60, Math.max(1, Math.round(days)));
  const today = todayStr();
  const stats: WasteStat[] = [];
  for (let offset = -n; offset <= -1; offset++) {
    for (const type of MEAL_TYPES) stats.push(wasteStat(addDays(today, offset), type));
  }
  return stats;
}

function wasteRate(fromOffset: number, toOffset: number): number {
  const today = todayStr();
  let prepared = 0;
  let wasted = 0;
  for (let o = fromOffset; o <= toOffset; o++) {
    for (const type of MEAL_TYPES) {
      const s = wasteStat(addDays(today, o), type);
      prepared += s.preparedKg;
      wasted += s.wastedKg;
    }
  }
  return prepared === 0 ? 0 : round1((wasted / prepared) * 100);
}

export function getAdminOverview(): AdminOverview {
  const today = todayStr();
  const lastWeek = addDays(today, -7);
  const now = Date.now();

  const meals = MEAL_TYPES.map((type) => {
    const w = serviceWindow(today, type);
    const closed = closures.has(mealIdOf(today, type));
    const booked = closed ? 0 : demand(today, type);
    const span = w.end.getTime() - w.start.getTime();
    const progress = Math.min(1, Math.max(0, (now - w.start.getTime()) / span));
    const previous = demand(lastWeek, type);
    return {
      mealType: type,
      booked,
      redeemed: Math.round(booked * 0.93 * progress),
      closed,
      cutoffAt: w.cutoff.toISOString(),
      trendPct: round1(((demand(today, type) - previous) / previous) * 100),
    };
  });

  const totalToday = MEAL_TYPES.reduce((sum, t) => sum + demand(today, t), 0);
  const totalLastWeek = MEAL_TYPES.reduce((sum, t) => sum + demand(lastWeek, t), 0);
  const avgWastePct = wasteRate(-7, -1);

  return {
    date: today,
    totalStudents: TOTAL_STUDENTS,
    onLeave: Math.round(TOTAL_STUDENTS * (0.04 + 0.04 * seeded(`l${today}`))),
    meals,
    avgWastePct,
    wasteTrendPct: round1(avgWastePct - wasteRate(-14, -8)),
    bookedTrendPct: round1(((totalToday - totalLastWeek) / totalLastWeek) * 100),
  };
}

// ------------------------------------------------- timings & closures API

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function getTimings(date?: string): Timing[] {
  const d = date ?? todayStr();
  assertDate(d);
  return MEAL_TYPES.map((type) => {
    const override = timingByDate.get(mealIdOf(d, type));
    return { mealType: type, ...(override ?? timingDefaults[type]), overridden: Boolean(override) };
  });
}

export function saveTimingOverride(override: TimingOverride): Timing[] {
  const type = assertMealType(override.mealType);
  const { cutoff, serviceStart, serviceEnd } = override;
  if (![cutoff, serviceStart, serviceEnd].every((t) => TIME_RE.test(t))) {
    throw new ApiError('BAD_REQUEST', 'Times must be in HH:mm format.');
  }
  if (!(cutoff < serviceStart && serviceStart < serviceEnd)) {
    throw new ApiError('BAD_REQUEST', 'Order must be: cutoff, then service start, then service end.');
  }
  const times: TimingTimes = { cutoff, serviceStart, serviceEnd };
  if (override.date) {
    assertDate(override.date);
    if (override.date < todayStr()) throw new ApiError('BAD_REQUEST', 'Cannot override timings for a past date.');
    timingByDate.set(mealIdOf(override.date, type), times);
    return getTimings(override.date);
  }
  timingDefaults[type] = times;
  return getTimings();
}

export function closeMeal(date: string, mealType: MealType | 'all'): Meal[] {
  assertDate(date);
  const types = mealType === 'all' ? MEAL_TYPES : [assertMealType(mealType)];
  const now = Date.now();
  for (const type of types) {
    const ended = now > serviceWindow(date, type).end.getTime();
    if (ended) {
      if (mealType !== 'all') throw new ApiError('BAD_REQUEST', 'That meal has already been served.');
      continue;
    }
    const id = mealIdOf(date, type);
    if (closures.has(id)) continue;
    closures.add(id);
    pushNotification(
      'danger',
      `${capitalise(type)} closed on ${formatDay(date)}`,
      `${MESS_CLOSED_LABEL}. Your booking is cancelled and a rebate will be credited (Demo policy).`,
    );
  }
  return getMeals(date);
}

/** Extra helper: undo a closure (handy for the admin Closures page and for demos). */
export function reopenMeal(date: string, mealType: MealType | 'all'): Meal[] {
  assertDate(date);
  const types = mealType === 'all' ? MEAL_TYPES : [assertMealType(mealType)];
  for (const type of types) closures.delete(mealIdOf(date, type));
  return getMeals(date);
}

// ------------------------------------------------------------------ seed

function seed(): void {
  const today = todayStr();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  // A past leave, a past closure, a past self-cancellation and an upcoming closure.
  leaves = [
    {
      id: nextId('lv'),
      startDate: addDays(today, -6),
      endDate: addDays(today, -5),
      mealTypes: [...MEAL_TYPES],
      reason: 'Home visit',
      status: 'ACTIVE',
      createdAt: daysAgo(8),
    },
  ];
  closures.add(mealIdOf(addDays(today, -3), 'lunch'));
  closures.add(mealIdOf(addDays(today, 3), 'dinner'));
  bookingOverrides.set(mealIdOf(addDays(today, -2), 'breakfast'), 'CANCELLED_BY_STUDENT');

  notifications = [
    {
      id: nextId('n'),
      kind: 'warning',
      title: 'Booking cutoffs',
      body: 'Breakfast closes at 7:00 AM, lunch at 10:30 AM and dinner at 5:30 PM. Cancel before then to get a rebate.',
      createdAt: daysAgo(0.01),
      read: false,
    },
    {
      id: nextId('n'),
      kind: 'danger',
      title: `Dinner closed on ${formatDay(addDays(today, 3))}`,
      body: `${MESS_CLOSED_LABEL}. Your booking is cancelled and a rebate will be credited (Demo policy).`,
      createdAt: daysAgo(1),
      read: false,
    },
    {
      id: nextId('n'),
      kind: 'info',
      title: 'Rebate credited',
      body: `Lunch on ${formatDay(addDays(today, -3))} was closed. ₹${MEAL_RATE.lunch} credited (Demo policy).`,
      createdAt: daysAgo(3),
      read: true,
    },
    {
      id: nextId('n'),
      kind: 'success',
      title: 'Leave confirmed',
      body: `${formatDay(addDays(today, -6))} to ${formatDay(addDays(today, -5))}: all bookings paused. Rebate applies (Demo policy).`,
      createdAt: daysAgo(8),
      read: true,
    },
  ];
}

seed();