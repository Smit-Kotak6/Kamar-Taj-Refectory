import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cx } from "../../lib/cx";

export type ToastVariant = "success" | "error" | "info";

const variantMeta: Record<ToastVariant, { icon: LucideIcon; container: string; iconColor: string }> = {
  success: { icon: CheckCircle2, container: "bg-ink text-white", iconColor: "text-[#6EE7A8]" },
  error: { icon: AlertCircle, container: "bg-danger text-white", iconColor: "text-white" },
  info: { icon: Info, container: "bg-ink text-white", iconColor: "text-[#B9A8FF]" },
};

export interface ToastProps {
  open: boolean;
  message: ReactNode;
  variant?: ToastVariant;
  /** Milliseconds before it closes itself. Pass 0 to keep it until dismissed. */
  duration?: number;
  onClose: () => void;
  className?: string;
}

/**
 * Controlled toast: the parent owns `open` and flips it off in `onClose`.
 * To restart the timer for a new message, give the component a new `key`.
 */
export function Toast({
  open,
  message,
  variant = "success",
  duration = 4000,
  onClose,
  className,
}: ToastProps) {
  // Keep the latest onClose without restarting the timer when the parent re-renders.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || duration <= 0) return;
    const id = window.setTimeout(() => onCloseRef.current(), duration);
    return () => window.clearTimeout(id);
  }, [open, duration]);

  if (!open) return null;

  const { icon: Icon, container, iconColor } = variantMeta[variant];

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cx(
        "fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-50 -translate-x-1/2",
        "flex w-[calc(100%-2rem)] max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-soft",
        container,
        className,
      )}
    >
      <Icon className={cx("mt-0.5 size-5 shrink-0", iconColor)} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm leading-snug">{message}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-lg p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}