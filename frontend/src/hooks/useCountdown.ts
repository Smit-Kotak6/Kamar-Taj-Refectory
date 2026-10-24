import { useEffect, useMemo, useState } from "react";

export type CountdownTarget = Date | string | number | null | undefined;

export interface CountdownState {
  /** Whole hours remaining (can exceed 24). */
  hours: number;
  /** Minutes remaining within the current hour (0-59). */
  minutes: number;
  /** Seconds remaining within the current minute (0-59). */
  seconds: number;
  /** Total whole seconds remaining; 0 once expired. */
  totalSeconds: number;
  /** "2h 15m" at an hour or more, "24m 10s" under an hour, "45s" under a minute. */
  formatted: string;
  /** True once the target has passed. A missing or invalid target counts as expired. */
  isExpired: boolean;
}

function toMs(target: CountdownTarget): number {
  if (target === null || target === undefined) return Number.NaN;
  return target instanceof Date ? target.getTime() : new Date(target).getTime();
}

function secondsLeft(targetMs: number, nowMs: number): number {
  if (Number.isNaN(targetMs)) return 0;
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000));
}

export function formatCountdown(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Counts down to `target`, re-rendering once per second until it expires. */
export function useCountdown(target: CountdownTarget): CountdownState {
  const targetMs = toMs(target);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(targetMs)) return;

    setNow(Date.now());
    if (Date.now() >= targetMs) return;

    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= targetMs) window.clearInterval(id);
    };
    const id = window.setInterval(tick, 1000);

    // Timers are throttled in background tabs, so resync when the tab returns.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [targetMs]);

  return useMemo(() => {
    const totalSeconds = secondsLeft(targetMs, now);
    return {
      hours: Math.floor(totalSeconds / 3600),
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
      totalSeconds,
      formatted: formatCountdown(totalSeconds),
      isExpired: totalSeconds === 0,
    };
  }, [targetMs, now]);
}