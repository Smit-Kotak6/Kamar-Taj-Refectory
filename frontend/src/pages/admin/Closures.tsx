import { useCallback, useEffect, useState } from "react";
import { Ban, CalendarX2, RotateCcw } from "lucide-react";
import {
  MEAL_TYPES,
  MESS_CLOSED_LABEL,
  closeMeal,
  getUpcomingClosures,
  reopenMeal,
} from "../../api";
import type { Closure, MealType } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Toast } from "../../components/ui/Toast";
import type { ToastVariant } from "../../components/ui/Toast";
import { cx } from "../../lib/cx";
import { MEAL_LABELS, errorMessage, formatLongDate, todayISO } from "../../lib/adminUtils";

type Scope = MealType | "all";

const SCOPES: Scope[] = [...MEAL_TYPES, "all"];
const SCOPE_LABELS: Record<Scope, string> = { ...MEAL_LABELS, all: "Entire mess" };

/** How far ahead the "Upcoming closures" list looks. */
const LOOK_AHEAD_DAYS = 60;

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

function inputClass(hasError: boolean): string {
  return cx(
    "h-11 w-full rounded-xl border bg-white px-3 text-ink outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-accent/40",
    hasError ? "border-danger" : "border-line focus:border-accent",
  );
}

/** "the entire mess" / "lunch" / "breakfast and dinner" */
function describeClosure(closure: Pick<Closure, "mealTypes" | "entireMess">): string {
  if (closure.entireMess) return "the entire mess";
  return closure.mealTypes.map((type) => MEAL_LABELS[type].toLowerCase()).join(" and ");
}

export function Closures() {
  const [date, setDate] = useState(todayISO());
  const [scope, setScope] = useState<Scope>("lunch");
  const [dateError, setDateError] = useState<string | null>(null);

  const [closures, setClosures] = useState<Closure[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const [reopenTarget, setReopenTarget] = useState<Closure | null>(null);
  const [reopening, setReopening] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, variant: ToastVariant) => {
    setToast({ id: Date.now(), message, variant });
  }, []);

  const loadClosures = useCallback(async () => {
    setLoadError(null);
    try {
      setClosures(await getUpcomingClosures(LOOK_AHEAD_DAYS));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadClosures();
  }, [loadClosures]);

  // True when the chosen selection is already fully closed, so pressing Close would do nothing.
  const existing = closures?.find((closure) => closure.date === date);
  const alreadyClosed = existing
    ? scope === "all"
      ? existing.entireMess
      : existing.mealTypes.includes(scope)
    : false;

  function findDateError(value: string): string | null {
    if (!value) return "Choose a date.";
    if (value < todayISO()) return "Choose today or a later date.";
    return null;
  }

  function handleDateChange(value: string) {
    setDate(value);
    if (dateError) setDateError(findDateError(value));
  }

  function handleCloseClick() {
    const error = findDateError(date);
    setDateError(error);
    if (error) return;
    setConfirmCloseOpen(true);
  }

  async function handleConfirmClose() {
    setClosing(true);
    try {
      await closeMeal(date, scope);
      notify(`Closed ${describeClosure({ mealTypes: scope === "all" ? [...MEAL_TYPES] : [scope], entireMess: scope === "all" })} on ${formatLongDate(date)}.`, "success");
      await loadClosures();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setClosing(false);
      setConfirmCloseOpen(false);
    }
  }

  async function handleConfirmReopen() {
    if (!reopenTarget) return;
    setReopening(true);
    try {
      await reopenMeal(reopenTarget.date, "all");
      notify(`Reopened ${describeClosure(reopenTarget)} on ${formatLongDate(reopenTarget.date)}.`, "success");
      await loadClosures();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setReopening(false);
      setReopenTarget(null);
    }
  }

  const today = todayISO();

  return (
    <div className="space-y-6 sm:space-y-8">
      <SectionHeader
        as="h1"
        title="Mess closures"
        description="Close one meal or the whole mess for a date, for example during a holiday or a kitchen breakdown."
      />

      {/* ------------------------------------------------------- close form */}
      <Card as="section" aria-labelledby="close-title" padding="lg">
        <SectionHeader as="h2" title={<span id="close-title">Close a meal</span>} />

        <div className="mt-5 space-y-5">
          <div className="max-w-xs">
            <label htmlFor="closure-date" className="mb-1 block text-sm text-ink/70">
              Date
            </label>
            <input
              id="closure-date"
              type="date"
              min={today}
              value={date}
              onChange={(event) => handleDateChange(event.target.value)}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "closure-date-error" : undefined}
              className={inputClass(Boolean(dateError))}
            />
            {dateError ? (
              <p id="closure-date-error" role="alert" className="mt-1 text-sm text-danger">
                {dateError}
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm text-ink/70">What to close</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SCOPES.map((option) => (
                <label
                  key={option}
                  className={cx(
                    "flex h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink transition-colors",
                    "hover:border-ink/30",
                    "has-[:checked]:border-accent has-[:checked]:bg-peach has-[:checked]:text-accent",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                  )}
                >
                  <input
                    type="radio"
                    name="closure-scope"
                    value={option}
                    checked={scope === option}
                    onChange={() => setScope(option)}
                    className="sr-only"
                  />
                  {SCOPE_LABELS[option]}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {alreadyClosed ? (
              <p className="text-sm text-ink/65">
                {scope === "all" ? "The entire mess is" : `${SCOPE_LABELS[scope]} is`} already closed on this date.
              </p>
            ) : null}
            <Button
              onClick={handleCloseClick}
              disabled={alreadyClosed}
              leftIcon={<Ban className="size-4" aria-hidden="true" />}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </div>
        </div>
      </Card>

      {/* ------------------------------------------------ upcoming closures */}
      <Card as="section" aria-labelledby="upcoming-title" padding="lg">
        <SectionHeader
          as="h2"
          title={<span id="upcoming-title">Upcoming closures</span>}
          description={`Closures in the next ${LOOK_AHEAD_DAYS} days.`}
        />

        <div className="mt-5">
          {loadError ? (
            <div role="alert" className="rounded-2xl bg-danger-soft p-4 text-sm text-danger">
              <p>Could not load closures: {loadError}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => void loadClosures()}>
                Try again
              </Button>
            </div>
          ) : closures === null ? (
            <div className="space-y-3" aria-busy="true" aria-label="Loading closures">
              {[0, 1].map((n) => (
                <div key={n} className="h-16 animate-pulse rounded-2xl bg-peach/40" />
              ))}
            </div>
          ) : closures.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-cream px-4 py-10 text-center">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-2xl bg-peach text-accent"
              >
                <CalendarX2 className="size-6" />
              </span>
              <p className="font-serif text-lg font-semibold text-ink">No upcoming closures</p>
              <p className="max-w-sm text-sm text-ink/65">
                The mess is open on every date. Closed meals show up here, marked “{MESS_CLOSED_LABEL}” for students.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {closures.map((closure) => (
                <li
                  key={closure.date}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {formatLongDate(closure.date)}
                      {closure.date === today ? (
                        <Badge variant="neutral" className="ml-2 align-middle">
                          Today
                        </Badge>
                      ) : null}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {closure.entireMess ? (
                        <Badge variant="danger" size="md" icon={Ban}>
                          Entire mess
                        </Badge>
                      ) : (
                        closure.mealTypes.map((type) => (
                          <Badge key={type} variant="danger" size="md" icon={Ban}>
                            {MEAL_LABELS[type]}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReopenTarget(closure)}
                    leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                    aria-label={`Reopen ${describeClosure(closure)} on ${formatLongDate(closure.date)}`}
                    className="self-start sm:self-center"
                  >
                    Reopen
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ----------------------------------------------------------- dialogs */}
      <ConfirmDialog
        open={confirmCloseOpen}
        tone="danger"
        title={`Close ${scope === "all" ? "the entire mess" : SCOPE_LABELS[scope].toLowerCase()} on ${formatLongDate(date)}?`}
        message="Existing bookings will become Cancelled — Mess Closed."
        confirmLabel="Close"
        loading={closing}
        onConfirm={() => void handleConfirmClose()}
        onCancel={() => setConfirmCloseOpen(false)}
      >
        <p className="text-sm text-ink/65">
          Students will see “{MESS_CLOSED_LABEL}” for {scope === "all" ? "every meal" : "this meal"} on that date.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={reopenTarget !== null}
        title={
          reopenTarget
            ? `Reopen ${describeClosure(reopenTarget)} on ${formatLongDate(reopenTarget.date)}?`
            : "Reopen"
        }
        message="These meals will no longer be marked as closed."
        confirmLabel="Reopen"
        loading={reopening}
        onConfirm={() => void handleConfirmReopen()}
        onCancel={() => setReopenTarget(null)}
      />

      {toast ? (
        <Toast
          key={toast.id}
          open
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}

export default Closures;