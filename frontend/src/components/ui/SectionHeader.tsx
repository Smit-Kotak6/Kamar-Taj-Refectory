import type { ReactNode } from "react";
import { cx } from "../../lib/cx";

type HeadingLevel = "h1" | "h2" | "h3";

const titleSizes: Record<HeadingLevel, string> = {
  h1: "text-3xl sm:text-4xl",
  h2: "text-2xl sm:text-3xl",
  h3: "text-xl sm:text-2xl",
};

export interface SectionHeaderProps {
  /** Small uppercase label above the title, e.g. "Today's Menu". */
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot for a date picker, tabs, or a link. */
  action?: ReactNode;
  as?: HeadingLevel;
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cx(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[0.7rem] font-medium uppercase tracking-[0.25em] text-ink/55">
            {eyebrow}
          </p>
        ) : null}
        <Heading className={cx("font-serif font-semibold leading-tight", titleSizes[Heading])}>
          {title}
        </Heading>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-ink/65 sm:text-base">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}