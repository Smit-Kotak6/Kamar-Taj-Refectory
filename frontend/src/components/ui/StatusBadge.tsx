import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Lock,
  Plane,
  XCircle,
  Ban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BookingStatus } from "../../api/types";
import { Badge } from "./Badge";
import type { BadgeSize, BadgeVariant } from "./Badge";

interface StatusMeta {
  label: string;
  variant: BadgeVariant;
  icon: LucideIcon;
}

// Record<BookingStatus, ...> makes TypeScript flag any status added to
// src/api/types.ts that is missing from this map.
const STATUS_META: Record<BookingStatus, StatusMeta> = {
  BOOKED: { label: "Booked", variant: "info", icon: CalendarCheck },
  NOT_BOOKED: { label: "Not booked", variant: "neutral", icon: XCircle },
  NOT_ELIGIBLE: { label: "Membership inactive", variant: "warning", icon: Lock },
  LOCKED: { label: "Locked", variant: "warning", icon: Lock },
  REDEEMED: { label: "Redeemed", variant: "success", icon: CheckCircle2 },
  EXPIRED_UNCONSUMED: { label: "Expired — Unconsumed", variant: "danger", icon: Clock },
  CANCELLED_BY_STUDENT: { label: "Cancelled by Student", variant: "neutral", icon: XCircle },
  ON_LEAVE: { label: "On Leave", variant: "info", icon: Plane },
  CANCELLED_MESS_CLOSED: { label: "Cancelled — Mess Closed", variant: "danger", icon: Ban },
};

export interface StatusBadgeProps {
  status: BookingStatus;
  size?: BadgeSize;
  className?: string;
}

export function StatusBadge({ status, size = "sm", className }: StatusBadgeProps) {
  const { label, variant, icon } = STATUS_META[status];
  return (
    <Badge variant={variant} size={size} icon={icon} className={className}>
      {label}
    </Badge>
  );
}
