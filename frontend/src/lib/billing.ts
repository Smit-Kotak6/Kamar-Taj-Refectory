// src/lib/billing.ts
// Pure functions for the billing page. No React, no fetching.
// Components call these; they never do the maths themselves.

import type {
  BillingItem,
  MealType,
  Payment,
  RebateEntry,
  RebateReason,
} from '../api';

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export const REBATE_REASON_LABELS: Record<RebateReason, string> = {
  ON_LEAVE: 'On leave',
  MESS_CLOSED: 'Mess closed',
  CANCELLED_BEFORE_CUTOFF: 'Cancelled before cutoff',
};

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 125000 -> "₹1,25,000" (Indian digit grouping). */
export function formatINR(amount: number): string {
  return inrFormatter.format(round2(amount));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Current local month as 'YYYY-MM'. */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** '2026-10' -> "October 2026" */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

/** '2026-10-24' -> "24 Oct" */
export function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

// ------------------------------------------------------------- statement

export interface StatementRow {
  id: string;
  date: string;
  description: string;
  /** Amount billed, or null when the row is not a charge. */
  charge: number | null;
  /** Money or rebate credit applied, or null when the row is a charge. */
  payment: number | null;
  /** Running balance after this row. Positive = student owes. */
  balance: number;
}

export interface BillingSummary {
  rows: StatementRow[];
  /** Closing balance of the statement. Negative means the student is in credit. */
  outstanding: number;
  /** Sum of payments received (rebate credits are not payments). */
  paid: number;
  /** Sum of rebates already credited. */
  rebatesCredited: number;
  /** Sum of rebates not yet credited. */
  rebatesPending: number;
}

interface DraftRow {
  id: string;
  date: string;
  description: string;
  charge: number | null;
  payment: number | null;
  order: number;
}

/**
 * Builds the monthly statement. Charges add to the balance; payments and
 * credited rebates reduce it. Pending rebates are not counted until credited.
 */
export function buildBillingSummary(
  items: BillingItem[],
  payments: Payment[],
  rebates: RebateEntry[],
): BillingSummary {
  const drafts: DraftRow[] = [];

  for (const item of items) {
    if (!item.charged) continue;
    drafts.push({
      id: `charge_${item.id}`,
      date: item.date,
      description: `${MEAL_LABELS[item.mealType]}: ${item.title}`,
      charge: item.amount,
      payment: null,
      order: 0,
    });
  }

  for (const p of payments) {
    drafts.push({
      id: `payment_${p.id}`,
      date: p.date,
      description: `Payment received via ${p.method} (${p.reference})`,
      charge: null,
      payment: p.amount,
      order: 1,
    });
  }

  let rebatesCredited = 0;
  let rebatesPending = 0;
  for (const r of rebates) {
    if (r.status === 'PENDING') {
      rebatesPending += r.amount;
      continue;
    }
    rebatesCredited += r.amount;
    drafts.push({
      id: `rebate_${r.id}`,
      date: r.date,
      description: `Rebate credit: ${MEAL_LABELS[r.mealType]} (${REBATE_REASON_LABELS[r.reason]})`,
      charge: null,
      payment: r.amount,
      order: 2,
    });
  }

  drafts.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  let balance = 0;
  const rows: StatementRow[] = drafts.map((d) => {
    balance = round2(balance + (d.charge ?? 0) - (d.payment ?? 0));
    return {
      id: d.id,
      date: d.date,
      description: d.description,
      charge: d.charge,
      payment: d.payment,
      balance,
    };
  });

  return {
    rows,
    outstanding: balance,
    paid: round2(payments.reduce((sum, p) => sum + p.amount, 0)),
    rebatesCredited: round2(rebatesCredited),
    rebatesPending: round2(rebatesPending),
  };
}

// ---------------------------------------------------------------- rebates

/** Rebates whose date falls in `month` ('YYYY-MM'), oldest first. */
export function rebatesForMonth(rebates: RebateEntry[], month: string): RebateEntry[] {
  return rebates
    .filter((r) => r.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
}