// src/api/payments.ts
// In-memory mock for student payments. Only src/api/index.ts imports this file.
// When the real backend exists, delete this file and make getPayments() in
// index.ts call fetch() instead.

export type PaymentMethod = 'UPI' | 'Cash' | 'Card' | 'Net banking';

export interface Payment {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** INR */
  amount: number;
  method: PaymentMethod;
  reference: string;
}

/** month = 'YYYY-MM'. The mock returns one fixed payment on the 1st of the month. */
export function getPayments(month: string): Payment[] {
  return [
    {
      id: `pay_${month}_1`,
      date: `${month}-01`,
      amount: 2000,
      method: 'UPI',
      reference: `UPI${month.replace('-', '')}001`,
    },
  ];
}