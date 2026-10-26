import { useEffect, useState } from "react";

/** Returns Date.now(), refreshed every `intervalMs`, so cutoff checks stay live. */
export function useNow(intervalMs: number = 15_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}