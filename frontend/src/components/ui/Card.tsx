import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/cx";

type CardPadding = "none" | "sm" | "md" | "lg";

const paddingClasses: Record<CardPadding, string> = {
  none: "",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-7",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Render as a different element, e.g. "section" or "article". */
  as?: ElementType;
  padding?: CardPadding;
  children?: ReactNode;
}

export function Card({
  as: Component = "div",
  padding = "md",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Component
      className={cx(
        "rounded-2xl border border-line bg-card shadow-soft",
        paddingClasses[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}