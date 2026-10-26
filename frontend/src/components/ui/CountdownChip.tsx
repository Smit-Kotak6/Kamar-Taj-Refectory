import { useEffect, useRef } from "react";
import { Clock, Lock } from "lucide-react";
import { useCountdown } from "../../hooks/useCountdown";
import type { CountdownTarget } from "../../hooks/useCountdown";
import { Badge } from "./Badge";

export interface CountdownChipProps {
  target: CountdownTarget;
  /** Text after the time, e.g. "left". Pass "" to hide. */
  suffix?: string;
  /** Chip turns orange below this many minutes. */
  warnBelowMinutes?: number;
  expiredLabel?: string;
  /** Called once when the countdown reaches zero while mounted. */
  onExpire?: () => void;
  className?: string;
}

export function CountdownChip({
  target,
  suffix = "left",
  warnBelowMinutes = 30,
  expiredLabel = "Locked",
  onExpire,
  className,
}: CountdownChipProps) {
  const { formatted, totalSeconds, isExpired } = useCountdown(target);

  const wasExpired = useRef(isExpired);
  useEffect(() => {
    if (!wasExpired.current && isExpired) onExpire?.();
    wasExpired.current = isExpired;
  }, [isExpired, onExpire]);

  if (isExpired) {
    return (
      <Badge
        variant="neutral"
        size="md"
        icon={Lock}
        role="timer"
        aria-label={expiredLabel}
        className={className}
      >
        {expiredLabel}
      </Badge>
    );
  }

  const isUrgent = totalSeconds < warnBelowMinutes * 60;
  const text = suffix ? `${formatted} ${suffix}` : formatted;

  return (
    <Badge
      variant={isUrgent ? "warning" : "info"}
      size="md"
      icon={Clock}
      role="timer"
      aria-label={text}
      className={className}
    >
      {text}
    </Badge>
  );
}