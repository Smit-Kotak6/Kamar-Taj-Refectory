import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, HelpCircle, Loader2 } from "lucide-react";
import { cx } from "../../lib/cx";
import { Button } from "./Button";

export type ConfirmTone = "default" | "danger";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Main explanation, e.g. "Existing bookings will become Cancelled — Mess Closed." */
  message: ReactNode;
  /** Optional extra content under the message (a summary, a list). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" gives a red confirm button and a warning icon. */
  tone?: ConfirmTone;
  /** Shows a spinner on the confirm button and blocks closing while a request runs. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Controlled confirmation dialog. The parent owns `open`.
 * Escape and a click on the backdrop cancel (unless `loading`); focus starts on Cancel,
 * stays inside the dialog while open, and returns to the trigger when it closes.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Keep the latest callbacks without re-running the focus effect on every render.
  const onCancelRef = useRef(onCancel);
  const loadingRef = useRef(loading);
  useEffect(() => {
    onCancelRef.current = onCancel;
    loadingRef.current = loading;
  }, [onCancel, loading]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!loadingRef.current) onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const isDanger = tone === "danger";
  const Icon = isDanger ? AlertTriangle : HelpCircle;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
        onClick={() => {
          if (!loading) onCancel();
        }}
      />

      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="relative w-full max-w-md rounded-3xl border border-line bg-card p-6 shadow-soft"
      >
        <div className="flex items-start gap-4">
          <div
            aria-hidden="true"
            className={cx(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl",
              isDanger ? "bg-danger-soft text-danger" : "bg-info-soft text-info",
            )}
          >
            <Icon className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-serif text-xl font-semibold leading-tight text-ink">
              {title}
            </h2>
            <div id={messageId} className="mt-2 text-sm text-ink/75 sm:text-base">
              {message}
            </div>
            {children ? <div className="mt-3">{children}</div> : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="sm:min-w-28"
          >
            {cancelLabel}
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading || undefined}
            className={cx(
              "inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-5 text-sm font-medium text-white transition-colors sm:min-w-28 sm:text-base",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isDanger ? "bg-danger hover:bg-danger/90" : "bg-ink hover:bg-ink/90",
            )}
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}