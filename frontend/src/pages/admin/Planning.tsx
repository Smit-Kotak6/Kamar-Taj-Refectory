import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CalendarClock, Moon, RotateCcw, Save, Sun, Sunrise } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MEAL_TYPES, getDefaultTimings, getTimings, saveTimingOverride } from "../../api";
import type { MealType, Timing } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { Toast } from "../../components/ui/Toast";
import type { ToastVariant } from "../../components/ui/Toast";
import { cx } from "../../lib/cx";
import {
  MEAL_LABELS,
  TIME_FIELD_KEYS,
  TIME_FIELD_LABELS,
  errorMessage,
  formatLongDate,
  formatTime12,
  hasErrors,
  sameTimes,
  todayISO,
  validateTimes,
} from "../../lib/adminUtils";
import type { TimeErrors, TimeFieldKey, TimeFields } from "../../lib/adminUtils";

const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Sunrise,
  lunch: Sun,
  dinner: Moon,
};

const EMPTY_TIMES: TimeFields = { cutoff: "", serviceStart: "", serviceEnd: "" };

type TimesByMeal = Record<MealType, TimeFields>;
type ErrorsByMeal = Record<MealType, TimeErrors>;

const NO_ERRORS: ErrorsByMeal = { breakfast: {}, lunch: {}, dinner: {} };

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

function toFields(timing: Timing): TimeFields {
  return {
    cutoff: timing.cutoff,
    serviceStart: timing.serviceStart,
    serviceEnd: timing.serviceEnd,
  };
}

function toTimesByMeal(timings: Timing[]): TimesByMeal {
  const result: TimesByMeal = {
    breakfast: { ...EMPTY_TIMES },
    lunch: { ...EMPTY_TIMES },
    dinner: { ...EMPTY_TIMES },
  };
  for (const timing of timings) result[timing.mealType] = toFields(timing);
  return result;
}

function inputClass(hasError: boolean): string {
  return cx(
    "h-11 w-full rounded-xl border bg-white px-3 text-ink tabular-nums outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-accent/40",
    hasError ? "border-danger" : "border-line focus:border-accent",
  );
}

// ------------------------------------------------------------ time input

interface TimeInputProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  /** Hide the label visually from the md breakpoint up (a table header names the column). */
  labelHiddenOnDesktop?: boolean;
  onChange: (value: string) => void;
}

function TimeInput({ id, label, value, error, labelHiddenOnDesktop, onChange }: TimeInputProps) {
  const errorId = `${id}-error`;
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className={cx("mb-1 block text-sm text-ink/70", labelHiddenOnDesktop && "md:sr-only")}
      >
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={inputClass(Boolean(error))}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// --------------------------------------------------------- default timings

const ROW_GRID = "md:grid-cols-[9rem_repeat(3,minmax(0,1fr))_auto]";

interface DefaultTimingsProps {
  onNotify: (message: string, variant: ToastVariant) => void;
}

function DefaultTimings({ onNotify }: DefaultTimingsProps) {
  const [saved, setSaved] = useState<TimesByMeal | null>(null);
  const [drafts, setDrafts] = useState<TimesByMeal | null>(null);
  const [errors, setErrors] = useState<ErrorsByMeal>(NO_ERRORS);
  const [savingMeal, setSavingMeal] = useState<MealType | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const timings = await getDefaultTimings();
      const next = toTimesByMeal(timings);
      setSaved(next);
      setDrafts(next);
      setErrors(NO_ERRORS);
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleChange(meal: MealType, key: TimeFieldKey, value: string) {
    if (!drafts) return;
    const updated: TimeFields = { ...drafts[meal], [key]: value };
    setDrafts({ ...drafts, [meal]: updated });
    // Once an error is showing, keep it in step with what the admin is typing.
    if (hasErrors(errors[meal])) {
      setErrors({ ...errors, [meal]: validateTimes(updated) });
    }
  }

  function handleReset(meal: MealType) {
    if (!saved || !drafts) return;
    setDrafts({ ...drafts, [meal]: saved[meal] });
    setErrors({ ...errors, [meal]: {} });
  }

  async function handleSave(meal: MealType) {
    if (!drafts) return;
    const found = validateTimes(drafts[meal]);
    setErrors({ ...errors, [meal]: found });
    if (hasErrors(found)) return; // blocked: nothing is saved until every field is valid

    setSavingMeal(meal);
    try {
      await saveTimingOverride({ mealType: meal, ...drafts[meal] });
      const refreshed = toTimesByMeal(await getDefaultTimings());
      setSaved(refreshed);
      setDrafts((current) => (current ? { ...current, [meal]: refreshed[meal] } : refreshed));
      onNotify(`${MEAL_LABELS[meal]} timings saved for every day.`, "success");
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setSavingMeal(null);
    }
  }

  return (
    <Card as="section" aria-labelledby="default-timings-title" padding="lg">
      <SectionHeader
        as="h2"
        title={<span id="default-timings-title">Default timings</span>}
        description="These apply to every day unless a date has its own override. Cutoff is the last moment students can book or cancel."
      />

      {loadError ? (
        <div role="alert" className="mt-6 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          <p>Could not load timings: {loadError}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !drafts || !saved ? (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading timings">
          {MEAL_TYPES.map((meal) => (
            <div key={meal} className="h-20 animate-pulse rounded-2xl bg-peach/40" />
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <div
            aria-hidden="true"
            className={cx("hidden gap-4 px-1 pb-2 text-sm text-ink/60 md:grid", ROW_GRID)}
          >
            <span>Meal</span>
            {TIME_FIELD_KEYS.map((key) => (
              <span key={key}>{TIME_FIELD_LABELS[key]}</span>
            ))}
            <span className="w-44" />
          </div>

          <ul className="divide-y divide-line">
            {MEAL_TYPES.map((meal) => {
              const Icon = MEAL_ICONS[meal];
              const rowErrors = errors[meal];
              const dirty = !sameTimes(drafts[meal], saved[meal]);
              const saving = savingMeal === meal;
              return (
                <li
                  key={meal}
                  className={cx("grid gap-4 py-5 first:pt-2 md:items-start", ROW_GRID)}
                >
                  <div className="flex items-center gap-3 md:h-11">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-peach text-accent"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="font-serif text-lg font-semibold text-ink">
                      {MEAL_LABELS[meal]}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:contents">
                    {TIME_FIELD_KEYS.map((key) => (
                      <TimeInput
                        key={key}
                        id={`default-${meal}-${key}`}
                        label={`${MEAL_LABELS[meal]} ${TIME_FIELD_LABELS[key].toLowerCase()}`}
                        value={drafts[meal][key]}
                        error={rowErrors[key]}
                        labelHiddenOnDesktop
                        onChange={(value) => handleChange(meal, key, value)}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2 md:w-44 md:justify-end md:h-11">
                    {dirty ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReset(meal)}
                        disabled={saving}
                        leftIcon={<RotateCcw className="size-4" aria-hidden="true" />}
                        aria-label={`Undo changes to ${MEAL_LABELS[meal]} timings`}
                      >
                        Undo
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      onClick={() => void handleSave(meal)}
                      disabled={!dirty}
                      loading={saving}
                      leftIcon={<Save className="size-4" aria-hidden="true" />}
                      aria-label={`Save ${MEAL_LABELS[meal]} timings`}
                    >
                      Save
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------- override form

interface OverrideFormProps {
  onNotify: (message: string, variant: ToastVariant) => void;
}

function OverrideForm({ onNotify }: OverrideFormProps) {
  const [date, setDate] = useState(todayISO());
  const [meal, setMeal] = useState<MealType>("lunch");
  const [times, setTimes] = useState<TimeFields>(EMPTY_TIMES);
  const [dateError, setDateError] = useState<string | null>(null);
  const [errors, setErrors] = useState<TimeErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<Timing | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Show what is in force for the chosen date and meal, so the admin knows what they are changing.
  useEffect(() => {
    if (!date) return;
    let cancelled = false;
    getTimings(date)
      .then((timings) => {
        if (!cancelled) setCurrent(timings.find((t) => t.mealType === meal) ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrent(null);
      });
    return () => {
      cancelled = true;
    };
  }, [date, meal, refreshKey]);

  function findDateError(value: string): string | null {
    if (!value) return "Choose a date.";
    if (value < todayISO()) return "Choose today or a later date.";
    return null;
  }

  function handleDateChange(value: string) {
    setDate(value);
    if (submitted) setDateError(findDateError(value));
  }

  function handleTimeChange(key: TimeFieldKey, value: string) {
    const updated = { ...times, [key]: value };
    setTimes(updated);
    if (submitted) setErrors(validateTimes(updated));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);

    const nextDateError = findDateError(date);
    const nextErrors = validateTimes(times);
    setDateError(nextDateError);
    setErrors(nextErrors);
    if (nextDateError || hasErrors(nextErrors)) return; // blocked

    setSaving(true);
    try {
      await saveTimingOverride({ date, mealType: meal, ...times });
      onNotify(`${MEAL_LABELS[meal]} timings saved for ${formatLongDate(date)}.`, "success");
      setTimes(EMPTY_TIMES);
      setErrors({});
      setSubmitted(false);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      onNotify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="override-title" padding="lg">
      <SectionHeader
        as="h2"
        title={<span id="override-title">Date-specific override</span>}
        description="Change the timings for one date only. Every other day keeps its default."
      />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="mt-6 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor="override-date" className="mb-1 block text-sm text-ink/70">
              Date
            </label>
            <input
              id="override-date"
              type="date"
              min={todayISO()}
              value={date}
              onChange={(event) => handleDateChange(event.target.value)}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "override-date-error" : undefined}
              className={inputClass(Boolean(dateError))}
            />
            {dateError ? (
              <p id="override-date-error" role="alert" className="mt-1 text-sm text-danger">
                {dateError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0">
            <label htmlFor="override-meal" className="mb-1 block text-sm text-ink/70">
              Meal
            </label>
            <select
              id="override-meal"
              value={meal}
              onChange={(event) => setMeal(event.target.value as MealType)}
              className={inputClass(false)}
            >
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MEAL_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {current ? (
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm text-ink/70">
            <span>
              In force for {MEAL_LABELS[meal].toLowerCase()}: cutoff {formatTime12(current.cutoff)},
              service {formatTime12(current.serviceStart)} to {formatTime12(current.serviceEnd)}
            </span>
            {current.overridden ? (
              <Badge variant="info" icon={CalendarClock}>
                Already overridden
              </Badge>
            ) : null}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          {TIME_FIELD_KEYS.map((key) => (
            <TimeInput
              key={key}
              id={`override-${key}`}
              label={`New ${TIME_FIELD_LABELS[key].toLowerCase()}`}
              value={times[key]}
              error={errors[key]}
              onChange={(value) => handleTimeChange(key, value)}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            loading={saving}
            leftIcon={<CalendarClock className="size-4" aria-hidden="true" />}
            className="w-full sm:w-auto"
          >
            Save override
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ page

export function Planning() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const notify = useCallback((message: string, variant: ToastVariant) => {
    setToast({ id: Date.now(), message, variant });
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8">
      <SectionHeader
        as="h1"
        title="Meal planning"
        description="Set when students can book each meal and when it is served."
      />

      <DefaultTimings onNotify={notify} />
      <OverrideForm onNotify={notify} />

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

export default Planning;