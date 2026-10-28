import { useState } from "react";
import { ArrowRight, Ban, ChevronUp } from "lucide-react";
import { MESS_CLOSED_LABEL } from "../../api";
import type { Meal, MealType } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { CountdownChip } from "../../components/ui/CountdownChip";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Toast } from "../../components/ui/Toast";
import type { ToastVariant } from "../../components/ui/Toast";
import { Toggle } from "../../components/ui/Toggle";
import { cx } from "../../lib/cx";
import {
  MEAL_TYPE_LABELS,
  formatServiceWindow,
  getAvailability,
  useMealPlanner,
} from "../../hooks/useMealPlanner";
import type { MealAvailability } from "../../hooks/useMealPlanner";

// ------------------------------------------------------------ meal section

interface MealSectionProps {
  meal: Meal;
  open: boolean;
  onToggleOpen: () => void;
  booked: boolean;
  unsaved: boolean;
  onBookedChange: (next: boolean) => void;
  onCutoffPassed: () => void;
}

function MealSection({
  meal,
  open,
  onToggleOpen,
  booked,
  unsaved,
  onBookedChange,
  onCutoffPassed,
}: MealSectionProps) {
  const availability: MealAvailability = getAvailability(meal);
  const bodyId = `meal-body-${meal.id}`;
  const closed = availability === "closed";

  // Before the cutoff, and just after it, the chip tells the story ("2h 15m to book" -> "Locked").
  const showChip =
    availability === "open" ||
    (availability === "locked" &&
      (meal.status === "BOOKED" || meal.status === "CANCELLED_BY_STUDENT"));

  let headerBadge;
  if (closed) {
    headerBadge = (
      <Badge variant="danger" size="md" icon={Ban}>
        Closed
      </Badge>
    );
  } else if (showChip) {
    headerBadge = (
      <CountdownChip target={meal.cutoffAt} suffix="to book" onExpire={onCutoffPassed} />
    );
  } else {
    headerBadge = <StatusBadge status={meal.status} size="md" />;
  }

  return (
    <Card as="section" padding="none" className="overflow-hidden">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-xl font-semibold leading-tight text-ink">
            {MEAL_TYPE_LABELS[meal.type as MealType]}
          </span>
          <span className="mt-0.5 block text-sm text-ink/60 tabular-nums">
            {formatServiceWindow(meal)}
          </span>
        </span>
        <span className="shrink-0">{headerBadge}</span>
        <ChevronUp
          className={cx("size-5 shrink-0 text-ink transition-transform", !open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div id={bodyId} className="border-t border-line bg-cream/60 p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <img
              src={meal.image}
              alt={meal.title}
              loading="lazy"
              className={cx(
                "size-20 shrink-0 rounded-xl object-cover sm:size-24",
                closed && "opacity-50 grayscale",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="font-serif text-lg font-semibold leading-tight text-ink sm:text-xl">
                {meal.title}
              </p>
              <p className="mt-0.5 text-sm text-ink/65">{meal.description}</p>
              {unsaved ? (
                <Badge variant="info" className="mt-2">
                  Unsaved change
                </Badge>
              ) : null}
            </div>
            <Toggle
              checked={booked}
              onChange={onBookedChange}
              disabled={availability !== "open"}
              label={`${booked ? "Cancel" : "Book"} ${MEAL_TYPE_LABELS[meal.type as MealType]}`}
            />
          </div>

          {closed ? (
            <p className="mt-3 rounded-xl bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
              {MESS_CLOSED_LABEL}
            </p>
          ) : null}
          {availability === "locked" ? (
            <p className="mt-3 text-sm text-ink/60">The cutoff has passed, so this booking is locked.</p>
          ) : null}
          {availability === "on_leave" ? (
            <p className="mt-3 text-sm text-ink/60">
              You are on leave for this meal. Cancel the leave to book it.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------- loading

function MealSkeleton() {
  return (
    <Card aria-hidden="true" className="animate-pulse">
      <div className="h-5 w-28 rounded bg-ink/10" />
      <div className="mt-2 h-4 w-40 rounded bg-ink/10" />
      <div className="mt-4 flex items-center gap-4">
        <div className="size-20 rounded-xl bg-ink/10" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-32 rounded bg-ink/10" />
          <div className="h-4 w-24 rounded bg-ink/10" />
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------- page

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

export function MyMeals() {
  const {
    days,
    selectedDate,
    selectDate,
    meals,
    loadState,
    errorMessage,
    reload,
    isBooked,
    hasPending,
    setBooked,
    confirmCount,
    changeCount,
    saving,
    save,
    refreshClock,
  } = useMealPlanner(4);

  const [openTypes, setOpenTypes] = useState<Record<MealType, boolean>>({
    breakfast: true,
    lunch: true,
    dinner: true,
  });
  const [toast, setToast] = useState<ToastState | null>(null);

  async function handleConfirm() {
    const result = await save();
    if (!result) return;
    setToast({
      id: Date.now(),
      message: result.message,
      variant: result.ok ? "success" : "error",
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <SectionHeader
        as="h1"
        title="Book Your Meal"
        description="Switch a meal on to book it. Each booking locks at its cutoff."
      />

      {/* Date chips: today + next 3 days */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="Choose a date">
        {days.map((day) => {
          const selected = day.date === selectedDate;
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => selectDate(day.date)}
              aria-pressed={selected}
              aria-current={day.isToday ? "date" : undefined}
              className={cx(
                "flex flex-col items-center rounded-2xl border px-1 py-2.5 text-sm transition-colors sm:py-3",
                selected
                  ? "border-ink bg-ink text-white"
                  : "border-line bg-card text-ink/75 hover:border-ink/30",
              )}
            >
              <span className="font-semibold">{day.weekday}</span>
              <span className="tabular-nums">{day.label}</span>
            </button>
          );
        })}
      </div>

      {/* Meals */}
      {loadState === "loading" ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading meals">
          <MealSkeleton />
          <MealSkeleton />
          <MealSkeleton />
        </div>
      ) : null}

      {loadState === "error" ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="font-semibold text-ink">Meals could not be loaded</p>
          <p className="text-sm text-ink/65">{errorMessage}</p>
          <Button variant="secondary" size="sm" onClick={reload}>
            Try again
          </Button>
        </Card>
      ) : null}

      {loadState === "ready" ? (
        <div className="flex flex-col gap-4">
          {meals.map((meal) => (
            <MealSection
              key={meal.id}
              meal={meal}
              open={openTypes[meal.type]}
              onToggleOpen={() =>
                setOpenTypes((prev) => ({ ...prev, [meal.type]: !prev[meal.type] }))
              }
              booked={isBooked(meal)}
              unsaved={hasPending(meal)}
              onBookedChange={(next) => setBooked(meal, next)}
              onCutoffPassed={refreshClock}
            />
          ))}
        </div>
      ) : null}

      {/* Sticky confirm bar. Set --bottom-nav-height in the layout if the mobile tab bar overlaps it. */}
      <div className="sticky bottom-[var(--bottom-nav-height,0px)] z-10 -mx-4 bg-gradient-to-t from-cream via-cream to-cream/0 px-4 pb-4 pt-6 sm:mx-0 sm:px-0">
        {changeCount > 0 ? (
          <p className="mb-2 text-center text-sm text-ink/65" aria-live="polite">
            {changeCount === 1 ? "1 unsaved change" : `${changeCount} unsaved changes`}
          </p>
        ) : null}
        <Button
          size="lg"
          fullWidth
          loading={saving}
          disabled={changeCount === 0 || loadState !== "ready"}
          onClick={handleConfirm}
          rightIcon={<ArrowRight className="size-5" aria-hidden="true" />}
        >
          Confirm Meals ({confirmCount})
        </Button>
      </div>

      <Toast
        key={toast?.id ?? "none"}
        open={toast !== null}
        message={toast?.message ?? ""}
        variant={toast?.variant ?? "success"}
        onClose={() => setToast(null)}
      />
    </div>
  );
}

export default MyMeals;