import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../../lib/cx";
import { Card } from "./Card";

export type StatTone = "peach" | "lilac" | "green" | "blue";
export type TrendDirection = "up" | "down" | "flat";
export type TrendSentiment = "positive" | "negative" | "neutral";

export interface StatTrend {
  /** Text shown in the chip, e.g. "12%" or "+6%". */
  label: string;
  direction?: TrendDirection;
  /** Defaults from direction: up = positive, down = negative, flat = neutral.
   *  Override when "down" is good news (e.g. less food waste). */
  sentiment?: TrendSentiment;
}

const tileClasses: Record<StatTone, string> = {
  peach: "bg-peach text-accent",
  lilac: "bg-info-soft text-info",
  green: "bg-success-soft text-success",
  blue: "bg-sky-soft text-blue-600",
};

const sentimentClasses: Record<TrendSentiment, string> = {
  positive: "bg-success-soft text-success",
  negative: "bg-danger-soft text-danger",
  neutral: "bg-[#F4EEE8] text-ink/70",
};

const defaultSentiment: Record<TrendDirection, TrendSentiment> = {
  up: "positive",
  down: "negative",
  flat: "neutral",
};

const trendIcons = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
} as const;

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  trend?: StatTrend;
  subtitle?: ReactNode;
  /** Optional element on the right edge (sparkline, chevron, mini chart). */
  aside?: ReactNode;
  /** Extra classes for the big number, e.g. "text-accent" for a countdown. */
  valueClassName?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "peach",
  trend,
  subtitle,
  aside,
  valueClassName,
  className,
}: StatCardProps) {
  const direction = trend?.direction ?? "up";
  const sentiment = trend?.sentiment ?? defaultSentiment[direction];
  const TrendIcon = trendIcons[direction];

  return (
    <Card className={cx("flex items-center gap-4", className)}>
      <div
        className={cx(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl sm:size-14",
          tileClasses[tone],
        )}
        aria-hidden="true"
      >
        <Icon className="size-6 sm:size-7" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink/65">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cx(
              "font-serif text-3xl font-semibold leading-tight text-ink tabular-nums",
              valueClassName,
            )}
          >
            {value}
          </span>
          {trend ? (
            <span
              className={cx(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
                sentimentClasses[sentiment],
              )}
            >
              <TrendIcon className="size-3.5" aria-hidden="true" />
              {trend.label}
            </span>
          ) : null}
        </div>
        {subtitle ? <p className="mt-0.5 text-sm text-ink/60">{subtitle}</p> : null}
      </div>

      {aside ? <div className="shrink-0">{aside}</div> : null}
    </Card>
  );
}