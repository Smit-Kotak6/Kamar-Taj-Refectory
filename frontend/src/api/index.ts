// src/api/index.ts
import { http } from './http';
import type {
  CreateLeaveInput,
  LeaveRequest,
  Meal,
  MealType,
  Notification,
  Preferences,
  QrToken,
  RedeemResult,
  Timing,
  TimingOverride,
} from './types';

export * from './types';
export type { Payment, PaymentMethod } from './payments';

/** A date on which one or more meals are closed (used by the admin Closures page). */
export interface Closure {
  /** 'YYYY-MM-DD' */
  date: string;
  /** The closed meals on that date, in breakfast, lunch, dinner order. */
  mealTypes: MealType[];
  /** true when all three meals are closed. */
  entireMess: boolean;
}

// ----------------------------------------------------------------- meals

const mealLabels: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const genericMealImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" fill="#f7ead9"/><circle cx="120" cy="120" r="64" fill="#fff" stroke="#d9bca2" stroke-width="8"/><text x="120" y="136" text-anchor="middle" font-size="44">🍽</text></svg>')}`;

export async function getMeals(date: string): Promise<Meal[]> {
  type MealResponse = Pick<Meal, 'id' | 'type' | 'date' | 'status' | 'closed' | 'serviceStart' | 'serviceEnd' | 'cutoffAt'> & { menu: { title: string; description: string } | null };
  const rows = await http<MealResponse[]>(`/api/meals?date=${encodeURIComponent(date)}`);
  return rows.map(row => {
    const label = mealLabels[row.type];
    if (!label) throw new Error(`Unknown meal type: ${row.type}`);
    return {
      ...row,
      title: row.menu?.title ?? label,
      description: row.menu?.description || (row.menu ? 'Menu published by the mess.' : 'Menu details have not been published yet.'),
      kcal: 0,
      tags: [],
      image: genericMealImage,
    };
  });
}

export async function setMealBooking(mealId: string, booked: boolean): Promise<Meal> {
  await http(`/api/meals/${encodeURIComponent(mealId)}/booking`, { method: 'PUT', body: { booked } });
  const date = mealId.split('_')[0];
  const meal = (await getMeals(date)).find(x => x.id === mealId);
  if (!meal) throw new Error('Meal was not returned after saving.');
  return meal;
}

// ----------------------------------------------------------------- leave

export async function createLeave(input: CreateLeaveInput): Promise<LeaveRequest> {
  return http<LeaveRequest>('/api/leaves', { method: 'POST', body: input });
}

export async function getLeaves(): Promise<LeaveRequest[]> {
  return http<LeaveRequest[]>('/api/leaves');
}

export async function cancelLeave(leaveId: string): Promise<LeaveRequest> {
  return http<LeaveRequest>(`/api/leaves/${encodeURIComponent(leaveId)}`, { method: 'DELETE' });
}

export async function updateLeave(leaveId: string, input: CreateLeaveInput): Promise<LeaveRequest> {
  return http<LeaveRequest>(`/api/leaves/${encodeURIComponent(leaveId)}`, { method: 'PUT', body: input });
}

// -------------------------------------------------------------------- QR

export async function getQrToken(mealId: string): Promise<QrToken> {
  return http<QrToken>(`/api/qr/${encodeURIComponent(mealId)}`, { method: 'POST' });
}

export async function redeem(tokenOrCode: string): Promise<RedeemResult> {
  const value = tokenOrCode.trim();
  return http<RedeemResult>('/api/staff/redeem', {
    method: 'POST',
    body: value.startsWith('KT1.') ? { token: value } : { manualCode: value },
  });
}

// ------------------------------------------------ preferences & notifications

export async function getPreferences(): Promise<Preferences> {
  return http<Preferences>('/api/student/preferences');
}

export async function savePreferences(preferences: Preferences): Promise<Preferences> {
  return http<Preferences>('/api/student/preferences', { method: 'PUT', body: preferences });
}

export async function getNotifications(): Promise<Notification[]> {
  return http<Notification[]>('/api/student/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  await http(`/api/student/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await http('/api/student/notifications/read-all', { method: 'PATCH' });
}

// ------------------------------------------------- timings & closures

/** Effective timings for a date (defaults to today). */
export async function getTimings(date?: string): Promise<Timing[]> {
  return http<Timing[]>(`/api/admin/timings${date ? `?date=${encodeURIComponent(date)}` : ''}`);
}

/**
 * The default timings that apply to every day, ignoring any date-specific override.
 * (Mock: a past date can never have an override, so it returns the defaults.
 * A real backend should expose a dedicated endpoint.)
 */
export async function getDefaultTimings(): Promise<Timing[]> {
  return http<Timing[]>('/api/admin/timings/defaults');
}

/** With `date`: override that day only. Without: change the default for every day. */
export async function saveTimingOverride(override: TimingOverride): Promise<Timing[]> {
  return http<Timing[]>('/api/admin/timings', { method: 'PUT', body: override });
}

/** Returns all three meals of that date, updated. */
export async function closeMeal(date: string, mealType: MealType | 'all'): Promise<void> {
  await http('/api/admin/closures', { method: 'POST', body: { date, mealType } });
}

/** Extra: undo a closure. Returns all three meals of that date, updated. */
export async function reopenMeal(date: string, mealType: MealType | 'all'): Promise<void> {
  await http(`/api/admin/closures?date=${encodeURIComponent(date)}&mealType=${encodeURIComponent(mealType)}`, { method: 'DELETE' });
}

/**
 * Closures that have not finished yet, soonest first, looking `days` days ahead
 * (today included). Meals whose service window has already ended are left out.
 */
export async function getUpcomingClosures(days: number = 30): Promise<Closure[]> {
  return http<Closure[]>(`/api/admin/closures?days=${days}`);
}

// ------------------------------------------------------------- student

export async function getStudentProfile(): Promise<{ id: string; name: string }> {
  const result = await http<{ user: { id: string; name: string } }>('/api/auth/me');
  return { id: result.user.id, name: result.user.name };
}
