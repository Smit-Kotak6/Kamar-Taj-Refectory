import type { ButtonHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

export interface ToggleProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "children"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Accessible name, e.g. "Opt in to Lunch". */
  label: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
  ...rest
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors",
        // Enlarges the tap target on touch screens without changing the look.
        "before:absolute before:-inset-2 before:content-['']",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-success" : "bg-[#D8CDC2]",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cx(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}