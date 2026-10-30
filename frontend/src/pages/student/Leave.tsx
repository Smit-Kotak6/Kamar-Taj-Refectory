// src/pages/student/Leave.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Ban,
  CalendarRange,
  CheckCircle2,
  Info,
  Lock,
  MinusCircle,
  Pencil,
  XCircle,
} from "lucide-react";
import { cancelLeave, createLeave, updateLeave, getLeaves, getMeals, MEAL_TYPES, MESS_CLOSED_LABEL } from "../../api";
import type { LeaveRequest, Meal, MealType } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Toast } from "../../components/ui/Toast";
import type { ToastVariant } from "../../components/ui/Toast";
import { cx } from "../../lib/cx";

// ------------------------------------------------------------------ helpers

const MAX_RANGE_DAYS = 60;

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDate(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatWeekday(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return "";
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

/** Every 'YYYY-MM-DD' from `from` to `to`, inclusive. Empty if the range is invalid. */
function eachDate(from: string, to: string): string[] {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end || start > end) return [];
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && out.length <= MAX_RANGE_DAYS) {
    out.push(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong. Please try again.";
}

type PreviewKind = "excluded" | "locked" | "closed";

function classify(meal: Meal, now: number): PreviewKind {
  if (meal.closed) return "closed";
  return new Date(meal.cutoffAt).getTime() > now ? "excluded" : "locked";
}

interface PreviewState {
  status: "idle" | "loading" | "ready" | "error";
  meals: Meal[];
  message?: string;
}

interface ToastState {
  key: number;
  open: boolean;
  message: string;
  variant: ToastVariant;
}

// --------------------------------------------------------------------- page

export function Leave() {
  const today = useMemo(() => toYmd(new Date()), []);

  // form
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [mealTypes, setMealTypes] = useState<MealType[]>([...MEAL_TYPES]);
  const [reason, setReason] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // preview
  const [preview, setPreview] = useState<PreviewState>({ status: "idle", meals: [] });

  // existing leaves
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leavesLoading, setLeavesLoading] = useState(true);
  const [leavesError, setLeavesError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState>({
    key: 0,
    open: false,
    message: "",
    variant: "success",
  });

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    setToast((t) => ({ key: t.key + 1, open: true, message, variant }));
  }, []);

  // ---- range validation
  const dates = useMemo(() => eachDate(from, to), [from, to]);

  const rangeError = useMemo(() => {
    if (!from || !to) return "Pick both a start and an end date.";
    if (from < today) return "Leave cannot start in the past.";
    if (to < from) return "The end date must be on or after the start date.";
    if (dates.length > MAX_RANGE_DAYS) return `Please keep the range within ${MAX_RANGE_DAYS} days.`;
    return null;
  }, [from, to, today, dates.length]);

  // ---- load leaves
  const loadLeaves = useCallback(async () => {
    try {
      setLeavesError(null);
      const list = await getLeaves();
      setLeaves(list);
    } catch (err) {
      setLeavesError(errorMessage(err));
    } finally {
      setLeavesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaves();
  }, [loadLeaves]);

  // ---- live preview
  useEffect(() => {
    if (rangeError || dates.length === 0) {
      setPreview({ status: "idle", meals: [] });
      return;
    }
    let cancelled = false;
    setPreview((p) => ({ ...p, status: "loading" }));

    Promise.all(dates.map((d) => getMeals(d)))
      .then((perDay) => {
        if (!cancelled) setPreview({ status: "ready", meals: perDay.flat() });
      })
      .catch((err) => {
        if (!cancelled) setPreview({ status: "error", meals: [], message: errorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [dates, rangeError]);

  const previewRows = useMemo(() => {
    const now = Date.now();
    return preview.meals
      .filter((m) => mealTypes.includes(m.type))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || MEAL_TYPES.indexOf(a.type) - MEAL_TYPES.indexOf(b.type),
      )
      .map((meal) => ({ meal, kind: classify(meal, now) }));
  }, [preview.meals, mealTypes]);

  const excludedCount = previewRows.filter((r) => r.kind === "excluded").length;
  const lockedCount = previewRows.filter((r) => r.kind === "locked").length;

  // ---- form actions
  function toggleMealType(type: MealType) {
    setMealTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );
  }

  function resetForm() {
    setFrom(today);
    setTo(today);
    setMealTypes([...MEAL_TYPES]);
    setReason("");
    setEditingId(null);
  }

  function startEdit(leave: LeaveRequest) {
    setEditingId(leave.id);
    // A leave that already started can only be re-registered from today onwards.
    setFrom(leave.startDate < today ? today : leave.startDate);
    setTo(leave.endDate);
    setMealTypes(leave.mealTypes);
    setReason(leave.reason);
    setConfirmingId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (rangeError) {
      showToast(rangeError, "error");
      return;
    }
    if (mealTypes.length === 0) {
      showToast("Select at least one meal.", "error");
      return;
    }

    setSubmitting(true);
    try {
      const input = {
        startDate: from,
        endDate: to,
        mealTypes,
        reason: reason.trim() || undefined,
      };
      if (editingId) await updateLeave(editingId, input);
      else await createLeave(input);
      showToast(editingId ? "Leave updated." : "Leave registered.");
      resetForm();
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setSubmitting(false);
      void loadLeaves();
    }
  }

  async function handleCancel(leaveId: string) {
    setBusyId(leaveId);
    try {
      await cancelLeave(leaveId);
      showToast("Leave cancelled.");
      if (editingId === leaveId) resetForm();
    } catch (err) {
      showToast(errorMessage(err), "error");
    } finally {
      setBusyId(null);
      setConfirmingId(null);
      void loadLeaves();
    }
  }

  const sortedLeaves = useMemo(
    () =>
      [...leaves].sort((a, b) => {
        if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
        return b.startDate.localeCompare(a.startDate);
      }),
    [leaves],
  );

  const inputClasses =
    "h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30";

  return (
    <div className="space-y-6">
      <Toast
        key={toast.key}
        open={toast.open}
        message={toast.message}
        variant={toast.variant}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
      />

      <SectionHeader
        as="h1"
        eyebrow="Leave"
        title="Going away? Skip the meals."
        description="Register leave to pause eligible meal bookings before their cutoff."
      />

      {/* ------------------------------------------------------- form card */}
      <Card as="section" padding="lg" aria-label="Register leave">
        <form onSubmit={handleSubmit} className="space-y-5">
          {editingId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-peach px-3 py-2 text-sm text-accent">
              <span className="inline-flex items-center gap-2 font-medium">
                <Pencil className="size-4" aria-hidden="true" />
                Editing an existing leave
              </span>
              <button
                type="button"
                onClick={resetForm}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Discard changes
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                <CalendarRange className="size-4 text-ink/55" aria-hidden="true" />
                From
              </span>
              <input
                type="date"
                value={from}
                min={today}
                onChange={(e) => {
                  const value = e.target.value;
                  setFrom(value);
                  if (value && to && to < value) setTo(value);
                }}
                className={inputClasses}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                <CalendarRange className="size-4 text-ink/55" aria-hidden="true" />
                To
              </span>
              <input
                type="date"
                value={to}
                min={from || today}
                onChange={(e) => setTo(e.target.value)}
                className={inputClasses}
                required
              />
            </label>
          </div>

          {rangeError ? (
            <p role="alert" className="text-sm text-danger">
              {rangeError}
            </p>
          ) : null}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Meals to skip</legend>
            <div className="flex flex-wrap gap-2">
              {MEAL_TYPES.map((type) => {
                const selected = mealTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleMealType(type)}
                    className={cx(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                      selected
                        ? "border-accent bg-peach text-accent"
                        : "border-ink/15 bg-white text-ink/70 hover:border-ink/30",
                    )}
                  >
                    {selected ? <CheckCircle2 className="size-4" aria-hidden="true" /> : null}
                    {MEAL_LABELS[type]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Reason <span className="font-normal text-ink/55">(optional)</span>
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={120}
              placeholder="e.g. Home for Diwali"
              className={inputClasses}
            />
          </label>

          {/* ---------------------------------------------- live preview */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-sans text-sm font-medium text-ink">Preview</h3>
              {preview.status === "ready" && previewRows.length > 0 ? (
                <p className="text-xs text-ink/60">
                  {excludedCount} excluded · {lockedCount} locked
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-line bg-cream/60">
              {preview.status === "idle" ? (
                <p className="p-4 text-sm text-ink/60">Choose valid dates to see which meals are affected.</p>
              ) : null}
              {preview.status === "loading" ? (
                <p className="p-4 text-sm text-ink/60" aria-live="polite">
                  Checking meals…
                </p>
              ) : null}
              {preview.status === "error" ? (
                <p role="alert" className="p-4 text-sm text-danger">
                  {preview.message}
                </p>
              ) : null}
              {preview.status === "ready" && previewRows.length === 0 ? (
                <p className="p-4 text-sm text-ink/60">
                  {mealTypes.length === 0 ? "Select at least one meal." : "No meals found in this range."}
                </p>
              ) : null}

              {preview.status === "ready" && previewRows.length > 0 ? (
                <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                  {previewRows.map(({ meal, kind }) => (
                    <li key={meal.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {formatWeekday(meal.date)}, {formatDate(meal.date)} · {MEAL_LABELS[meal.type]}
                        </p>
                        <p className="truncate text-xs text-ink/60">{meal.title}</p>
                      </div>
                      {kind === "excluded" ? (
                        <Badge variant="success" icon={MinusCircle}>
                          Will be excluded
                        </Badge>
                      ) : kind === "locked" ? (
                        <Badge variant="neutral" icon={Lock}>
                          Locked (cutoff passed)
                        </Badge>
                      ) : (
                        <Badge variant="danger" icon={Ban}>
                          {MESS_CLOSED_LABEL}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2.5 text-sm text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Only meals whose cutoff has not passed are affected.
          </p>

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={submitting}
            disabled={Boolean(rangeError) || mealTypes.length === 0}
          >
            {editingId ? "Save Changes" : "Register Leave"}
          </Button>
        </form>
      </Card>

      {/* ------------------------------------------------ existing leaves */}
      <section aria-label="Your leaves" className="space-y-4">
        <SectionHeader as="h2" eyebrow="History" title="Your leaves" />

        {leavesLoading ? <p className="text-sm text-ink/60">Loading your leaves…</p> : null}
        {leavesError ? (
          <p role="alert" className="text-sm text-danger">
            {leavesError}
          </p>
        ) : null}
        {!leavesLoading && !leavesError && sortedLeaves.length === 0 ? (
          <Card className="text-center text-sm text-ink/60">No leaves registered yet.</Card>
        ) : null}

        <ul className="space-y-3">
          {sortedLeaves.map((leave) => {
            const isActive = leave.status === "ACTIVE";
            const ended = leave.endDate < today;
            const canModify = isActive && !ended && leave.startDate >= today;
            const confirming = confirmingId === leave.id;
            const busy = busyId === leave.id;

            return (
              <li key={leave.id}>
                <Card
                  as="article"
                  className={cx(
                    "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                    !canModify && "opacity-70",
                  )}
                >
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-serif text-lg font-semibold text-ink">
                        {leave.startDate === leave.endDate
                          ? formatDate(leave.startDate)
                          : `${formatDate(leave.startDate)} → ${formatDate(leave.endDate)}`}
                      </p>
                      {!isActive ? (
                        <Badge variant="neutral" icon={XCircle}>
                          Cancelled
                        </Badge>
                      ) : ended ? (
                        <Badge variant="neutral" icon={CheckCircle2}>
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="success" icon={CheckCircle2}>
                          Active
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {leave.mealTypes.map((type) => (
                        <Badge key={type} variant="info">
                          {MEAL_LABELS[type]}
                        </Badge>
                      ))}
                    </div>
                    {leave.reason ? <p className="text-sm text-ink/65">{leave.reason}</p> : null}
                  </div>

                  {canModify ? (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {confirming ? (
                        <>
                          <span className="text-sm text-ink/70">Cancel this leave?</span>
                          <Button size="sm" variant="secondary" onClick={() => setConfirmingId(null)} disabled={busy}>
                            Keep
                          </Button>
                          <Button size="sm" loading={busy} onClick={() => void handleCancel(leave.id)}>
                            Yes, cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            leftIcon={<Pencil className="size-4" aria-hidden="true" />}
                            onClick={() => startEdit(leave)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<XCircle className="size-4" aria-hidden="true" />}
                            onClick={() => setConfirmingId(leave.id)}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
