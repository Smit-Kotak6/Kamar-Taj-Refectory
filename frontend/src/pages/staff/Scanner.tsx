import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Keyboard,
  ScanLine,
  Ticket,
  WifiOff,
  XCircle,
} from "lucide-react";
import { redeem } from "../../api";
import { http } from "../../api/http";
import type { MealType, RedeemOutcome, RedeemResult } from "../../api";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatCard } from "../../components/ui/StatCard";

// ------------------------------------------------------------------ config

const READER_ID = "qr-reader";
const OVERLAY_MS = 2000;
/** After a result, ignore the same camera code for this long so one QR is not scanned twice. */
const SAME_CODE_COOLDOWN_MS = 4000;
const MAX_RECENT = 10;

/** Reserved for the offline queue feature. Wire this to real state later. */
const OFFLINE_QUEUE_COUNT = 0;

type ScanSource = "camera" | "manual";
type CameraState = "idle" | "starting" | "scanning";

interface ScanEntry {
  id: string;
  at: string;
  source: ScanSource;
  outcome: RedeemOutcome;
  studentName?: string;
  mealLabel?: string;
  message: string;
}

const OUTCOME_HEADLINE: Record<Exclude<RedeemOutcome, "valid">, string> = {
  expired: "CODE EXPIRED",
  already_redeemed: "ALREADY REDEEMED",
  closed: "MESS CLOSED",
  not_eligible: "NOT ELIGIBLE",
};

// ----------------------------------------------------------------- helpers

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function mealLabel(result: RedeemResult): string | undefined {
  const type: MealType | undefined = result.mealType;
  if (result.mealTitle && type) return `${capitalize(type)} · ${result.mealTitle}`;
  if (result.mealTitle) return result.mealTitle;
  if (type) return capitalize(type);
  return undefined;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function describeCameraError(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  const text = err instanceof Error ? err.message : String(err);
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    /permission|denied|notallowed/i.test(text)
  ) {
    return "Camera access is blocked. Allow camera permission for this site in your browser settings, then tap Start camera again. You can enter the booking code below in the meantime.";
  }
  if (name === "NotFoundError" || /no camera|requested device not found/i.test(text)) {
    return "No camera was found on this device. Enter the booking code below instead.";
  }
  if (name === "NotReadableError" || /in use|not readable/i.test(text)) {
    return "The camera is being used by another app. Close it and try again, or enter the booking code below.";
  }
  return "The camera could not start. Try again, or enter the booking code below.";
}

// -------------------------------------------------------------------- page

export default function Scanner() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const busyRef = useRef(false);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>("idle");
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [overlay, setOverlay] = useState<{ key: number; result: RedeemResult } | null>(null);
  const [recent, setRecent] = useState<ScanEntry[]>([]);
  const [redeemedCount, setRedeemedCount] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      const result = await http<{ date: string; redeemed: number }>("/api/staff/summary");
      setRedeemedCount(result.redeemed);
      setSummaryError("");
    } catch (error) { setSummaryError(error instanceof Error ? error.message : "Could not load count."); }
  }, []);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  // ------------------------------------------------ one shared redeem path

  const submit = useCallback(async (raw: string, source: ScanSource) => {
    const value = raw.trim();
    if (!value || busyRef.current) return;
    busyRef.current = true;
    if (source === "manual") setSubmitting(true);

    let result: RedeemResult;
    try {
      result = await redeem(value);
    } catch (err) {
      result = {
        outcome: "not_eligible",
        message: err instanceof Error ? err.message : "Something went wrong. Try again.",
      };
    }

    const now = new Date();
    if (source === "camera") lastScanRef.current = { text: value, at: now.getTime() };
    if (result.outcome === "valid") void loadSummary();

    setRecent((list) =>
      [
        {
          id: `${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
          at: result.redeemedAt ?? now.toISOString(),
          source,
          outcome: result.outcome,
          studentName: result.studentName,
          mealLabel: mealLabel(result),
          message: result.message,
        },
        ...list,
      ].slice(0, MAX_RECENT),
    );

    if (source === "manual") {
      setSubmitting(false);
      if (result.outcome === "valid") setCode("");
    }
    setOverlay({ key: now.getTime(), result });
  }, [loadSummary]);

  // Close the overlay after 2 seconds, then allow the next scan.
  useEffect(() => {
    if (!overlay) return;
    const id = window.setTimeout(() => {
      setOverlay(null);
      busyRef.current = false;
    }, OVERLAY_MS);
    return () => window.clearTimeout(id);
  }, [overlay]);

  // ------------------------------------------------------------- camera

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) {
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        // Already stopped; nothing to do.
      }
      try {
        scanner.clear();
      } catch {
        // Element may already be gone.
      }
    }
    setCameraState("idle");
  }, []);

  const startCamera = useCallback(async () => {
    if (scannerRef.current) return;
    setCameraError(null);
    setCameraState("starting");

    const scanner = new Html5Qrcode(READER_ID, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    scannerRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: (width, height) => {
            const side = Math.floor(Math.min(width, height) * 0.7);
            return { width: side, height: side };
          },
        },
        (decodedText) => {
          if (busyRef.current) return;
          const last = lastScanRef.current;
          if (last && last.text === decodedText && Date.now() - last.at < SAME_CODE_COOLDOWN_MS) {
            return;
          }
          void submit(decodedText, "camera");
        },
        undefined,
      );
      // The user may have tapped Stop or left the page while the camera was starting.
      if (scannerRef.current === scanner) setCameraState("scanning");
      else await scanner.stop().catch(() => undefined);
    } catch (err) {
      if (scannerRef.current === scanner) scannerRef.current = null;
      try {
        scanner.clear();
      } catch {
        // Nothing was rendered.
      }
      setCameraError(describeCameraError(err));
      setCameraState("idle");
    }
  }, [submit]);

  // Turn the camera off when leaving the page.
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void (async () => {
          try {
            if (scanner.isScanning) await scanner.stop();
            scanner.clear();
          } catch {
            // Ignore teardown errors.
          }
        })();
      }
    };
  }, []);

  // -------------------------------------------------------------- manual

  const onManualSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(code, "manual");
  };

  const isScanning = cameraState === "scanning";
  const isStarting = cameraState === "starting";

  // -------------------------------------------------------------- render

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8">
      <SectionHeader
        as="h1"
        eyebrow="Staff"
        title="Scan meal passes"
        description="Scan a student's QR code, or type the short code if scanning fails."
        action={
          <Badge variant="neutral" size="md" icon={WifiOff} aria-label="Offline queue">
            Offline queue ({OFFLINE_QUEUE_COUNT})
          </Badge>
        }
      />

      <StatCard
        label="Today's redemptions"
        value={redeemedCount ?? "—"}
        icon={Ticket}
        tone="green"
        subtitle="Saved check-ins for all staff today"
      />
      {summaryError && <p role="alert" className="text-sm text-danger">{summaryError} <button type="button" className="underline" onClick={() => void loadSummary()}>Retry</button></p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Camera */}
        <Card as="section" padding="lg" aria-labelledby="camera-heading" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="camera-heading" className="font-serif text-xl font-semibold">
              Camera scanner
            </h2>
            {isScanning ? (
              <Badge variant="success" size="md" icon={ScanLine}>
                Scanning
              </Badge>
            ) : null}
          </div>

          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-ink">
            {/* html5-qrcode owns the contents of this element, so keep it empty. */}
            <div id={READER_ID} className="size-full [&_video]:size-full [&_video]:object-cover" />
            {!isScanning ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
                {cameraError ? (
                  <CameraOff className="size-10" aria-hidden="true" />
                ) : (
                  <Camera className="size-10" aria-hidden="true" />
                )}
                <p className="text-sm">
                  {isStarting ? "Starting camera…" : "The camera is off"}
                </p>
              </div>
            ) : null}
          </div>

          {cameraError ? (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-4 py-3 text-sm leading-snug text-danger"
            >
              {cameraError}
            </p>
          ) : null}

          {isScanning ? (
            <Button variant="secondary" size="lg" fullWidth onClick={() => void stopCamera()}>
              Stop camera
            </Button>
          ) : (
            <Button
              size="lg"
              fullWidth
              loading={isStarting}
              leftIcon={<Camera className="size-5" aria-hidden="true" />}
              onClick={() => void startCamera()}
            >
              {isStarting ? "Starting…" : "Start camera"}
            </Button>
          )}
        </Card>

        {/* Manual + recent */}
        <div className="flex flex-col gap-6">
          <Card as="section" padding="lg" aria-labelledby="manual-heading">
            <h2 id="manual-heading" className="font-serif text-xl font-semibold">
              Enter booking code
            </h2>
            <p className="mt-1 text-sm text-ink/65">
              Use this when the camera is blocked or the QR code will not scan.
            </p>
            <form onSubmit={onManualSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="manual-code" className="sr-only">
                Booking code
              </label>
              <input
                id="manual-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="Booking code"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-4 text-base text-ink placeholder:text-ink/40 focus:border-ink/40 focus:outline-none focus:ring-2 focus:ring-peach"
              />
              <Button
                type="submit"
                size="md"
                loading={submitting}
                disabled={!code.trim()}
                leftIcon={<Keyboard className="size-4" aria-hidden="true" />}
              >
                Redeem
              </Button>
            </form>
          </Card>

          <Card as="section" padding="lg" aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="font-serif text-xl font-semibold">
              Recent scans
            </h2>
            {recent.length === 0 ? (
              <p className="mt-3 text-sm text-ink/60">
                No scans yet. Results will appear here as you scan.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {recent.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {entry.studentName ?? "Unknown student"}
                      </p>
                      <p className="truncate text-sm text-ink/60">
                        {entry.outcome === "valid"
                          ? entry.mealLabel ?? "Meal redeemed"
                          : entry.message}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant={entry.outcome === "valid" ? "success" : "danger"}
                        icon={entry.outcome === "valid" ? CheckCircle2 : XCircle}
                      >
                        {entry.outcome === "valid" ? "Valid" : "Rejected"}
                      </Badge>
                      <span className="text-xs text-ink/50 tabular-nums">
                        {formatTime(entry.at)} · {entry.source === "camera" ? "Camera" : "Manual"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {overlay ? <ResultOverlay result={overlay.result} onDismiss={() => setOverlay(null)} /> : null}
    </div>
  );
}

// ----------------------------------------------------------------- overlay

function ResultOverlay({
  result,
  onDismiss,
}: {
  result: RedeemResult;
  onDismiss: () => void;
}) {
  const valid = result.outcome === "valid";
  const Icon = valid ? CheckCircle2 : XCircle;
  const headline = valid ? "VALID" : OUTCOME_HEADLINE[result.outcome as Exclude<RedeemOutcome, "valid">];
  const meal = mealLabel(result);

  return (
    <div
      role={valid ? "status" : "alert"}
      aria-live={valid ? "polite" : "assertive"}
      onClick={onDismiss}
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 px-6 text-center text-white ${
        valid ? "bg-success" : "bg-danger"
      }`}
    >
      <Icon className="size-24 sm:size-32" aria-hidden="true" />
      <p className="font-serif text-5xl font-semibold sm:text-7xl">{headline}</p>
      {valid ? (
        <div className="space-y-1">
          {result.studentName ? (
            <p className="text-2xl font-medium sm:text-3xl">{result.studentName}</p>
          ) : null}
          {result.studentId ? <p className="text-base text-white/80">{result.studentId}</p> : null}
          {meal ? <p className="text-lg text-white/90 sm:text-xl">{meal}</p> : null}
        </div>
      ) : (
        <div className="space-y-1">
          <p className="max-w-md text-lg text-white/95 sm:text-xl">{result.message}</p>
          {result.studentName ? <p className="text-base text-white/80">{result.studentName}</p> : null}
        </div>
      )}
    </div>
  );
}
