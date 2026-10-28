import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";

export interface GradientHeroProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Small uppercase label above the heading. */
  eyebrow?: string;
  /** Big white serif heading. Use <br /> for deliberate line breaks. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Slot for action buttons, rendered under the subtitle. */
  children?: ReactNode;
  /** Optional right-hand slot (image, stat card, illustration). */
  aside?: ReactNode;
}

export function GradientHero({
  eyebrow,
  title,
  subtitle,
  children,
  aside,
  className,
  ...rest
}: GradientHeroProps) {
  return (
    <section
      className={cx(
        "relative isolate overflow-hidden rounded-3xl bg-brand-gradient text-white shadow-soft",
        className,
      )}
      {...rest}
    >
      {/* Soft decorative glows, purely visual. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-24 -z-10 size-72 rounded-full bg-white/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 right-1/3 -z-10 size-80 rounded-full bg-brand-purple/40 blur-3xl"
      />

      <div
        className={cx(
          "grid items-center gap-8 p-6 sm:p-10 lg:p-12",
          aside && "lg:grid-cols-[1.1fr_1fr]",
        )}
      >
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.3em] text-white/85">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-serif text-4xl font-semibold leading-[1.05] text-white [text-shadow:0_1px_14px_rgb(120_30_60/0.25)] sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-4 max-w-xl text-base text-white/90 sm:text-lg">{subtitle}</p>
          ) : null}
          {children ? <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div> : null}
        </div>
        {aside ? <div className="min-w-0">{aside}</div> : null}
      </div>
    </section>
  );
}