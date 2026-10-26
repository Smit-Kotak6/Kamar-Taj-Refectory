import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, CheckCircle2, TriangleAlert, Wallet } from "lucide-react";
import { ApiError, getBilling, getPayments, getRebates } from "../../api";
import type { BillingItem, Payment, RebateEntry } from "../../api";
import {
  MEAL_LABELS,
  REBATE_REASON_LABELS,
  buildBillingSummary,
  currentMonthKey,
  formatINR,
  formatMonthLabel,
  formatShortDate,
  rebatesForMonth,
} from "../../lib/billing";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatCard } from "../../components/ui/StatCard";

const thClass =
  "whitespace-nowrap border-b border-line px-4 py-3 text-left text-xs font-medium text-ink/60 sm:px-5";
const thRightClass = `${thClass} text-right`;
const tdClass = "px-4 py-3 align-top text-sm text-ink sm:px-5";
const tdNumClass = `${tdClass} whitespace-nowrap text-right tabular-nums`;

export default function Billing() {
  const month = useMemo(() => currentMonthKey(), []);

  const [items, setItems] = useState<BillingItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rebates, setRebates] = useState<RebateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [billingData, paymentData, rebateData] = await Promise.all([
        getBilling(month),
        getPayments(month),
        getRebates(),
      ]);
      setItems(billingData);
      setPayments(paymentData);
      setRebates(rebateData);
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "Could not load your billing details.",
      );
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthRebates = useMemo(() => rebatesForMonth(rebates, month), [rebates, month]);
  const summary = useMemo(
    () => buildBillingSummary(items, payments, monthRebates),
    [items, payments, monthRebates],
  );

  const monthLabel = formatMonthLabel(month);

  const duesSubtitle =
    summary.outstanding > 0
      ? "Due for " + monthLabel
      : summary.outstanding < 0
        ? "You are in credit"
        : "All settled";

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        eyebrow="Billing"
        title="Billing & Rebates"
        description={`Your mess charges, payments and rebates for ${monthLabel}.`}
      />

      {error ? (
        <Card role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{error}</p>
          <Button size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </Card>
      ) : loading ? (
        <BillingSkeleton />
      ) : (
        <>
          {/* ------------------------------------------------------ stats */}
          <section aria-label="Billing summary" className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Outstanding dues"
              value={formatINR(summary.outstanding)}
              icon={Wallet}
              tone="peach"
              subtitle={duesSubtitle}
              valueClassName={summary.outstanding > 0 ? "text-accent" : undefined}
            />
            <StatCard
              label="Paid this month"
              value={formatINR(summary.paid)}
              icon={CheckCircle2}
              tone="green"
              subtitle={
                payments.length === 1 ? "1 payment" : `${payments.length} payments`
              }
            />
            <StatCard
              label="Rebates this month"
              value={formatINR(summary.rebatesCredited)}
              icon={BadgePercent}
              tone="lilac"
              subtitle={
                summary.rebatesPending > 0
                  ? `${formatINR(summary.rebatesPending)} pending`
                  : "Credited to your account"
              }
            />
          </section>

          {/* ---------------------------------------------- monthly statement */}
          <section className="space-y-3" aria-labelledby="statement-heading">
            <SectionHeader
              as="h2"
              title={<span id="statement-heading">Monthly Statement</span>}
              description={monthLabel}
            />
            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse">
                  <caption className="sr-only">
                    Charges, payments and running balance for {monthLabel}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>Date</th>
                      <th scope="col" className={thClass}>Description</th>
                      <th scope="col" className={thRightClass}>Charge</th>
                      <th scope="col" className={thRightClass}>Payment</th>
                      <th scope="col" className={thRightClass}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-sm text-ink/60">
                          No charges or payments yet this month.
                        </td>
                      </tr>
                    ) : (
                      summary.rows.map((row) => (
                        <tr key={row.id} className="border-b border-line last:border-0">
                          <td className={`${tdClass} whitespace-nowrap`}>
                            {formatShortDate(row.date)}
                          </td>
                          <td className={tdClass}>{row.description}</td>
                          <td className={tdNumClass}>
                            {row.charge === null ? (
                              <span className="text-ink/30" aria-label="No charge">–</span>
                            ) : (
                              formatINR(row.charge)
                            )}
                          </td>
                          <td className={`${tdNumClass} text-success`}>
                            {row.payment === null ? (
                              <span className="text-ink/30" aria-label="No payment">–</span>
                            ) : (
                              formatINR(row.payment)
                            )}
                          </td>
                          <td className={`${tdNumClass} font-medium`}>
                            {formatINR(row.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {summary.rows.length > 0 ? (
                    <tfoot>
                      <tr className="border-t border-line bg-peach/30">
                        <th scope="row" colSpan={4} className={`${tdClass} text-left font-semibold`}>
                          Closing balance
                        </th>
                        <td className={`${tdNumClass} font-semibold`}>
                          {formatINR(summary.outstanding)}
                        </td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            </Card>
          </section>

          {/* ------------------------------------------------- rebate ledger */}
          <section className="space-y-3" aria-labelledby="ledger-heading">
            <SectionHeader
              as="h2"
              title={<span id="ledger-heading">Rebate Ledger</span>}
              description="Credits for meals you did not eat."
            />

            <div
              role="note"
              className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
              <p>
                <strong className="font-semibold">Demo rebate policy:</strong> illustrative only,
                final policy to be confirmed by the mess committee.
              </p>
            </div>

            <Card padding="none" className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse">
                  <caption className="sr-only">Rebates credited in {monthLabel}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={thClass}>Date</th>
                      <th scope="col" className={thClass}>Meal</th>
                      <th scope="col" className={thClass}>Reason</th>
                      <th scope="col" className={thRightClass}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRebates.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-8 text-center text-sm text-ink/60">
                          No rebates this month.
                        </td>
                      </tr>
                    ) : (
                      monthRebates.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className={`${tdClass} whitespace-nowrap`}>
                            {formatShortDate(r.date)}
                          </td>
                          <td className={tdClass}>{MEAL_LABELS[r.mealType]}</td>
                          <td className={tdClass}>
                            <div className="flex flex-wrap items-center gap-2">
                              <span>{REBATE_REASON_LABELS[r.reason]}</span>
                              <Badge variant="neutral">{r.policyLabel}</Badge>
                            </div>
                          </td>
                          <td className={tdNumClass}>
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-medium text-success">
                                {formatINR(r.amount)}
                              </span>
                              {r.status === "PENDING" ? (
                                <Badge variant="warning">Pending</Badge>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading billing details…</span>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#F4EEE8]" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-[#F4EEE8]" />
      <div className="h-40 animate-pulse rounded-2xl bg-[#F4EEE8]" />
    </div>
  );
}