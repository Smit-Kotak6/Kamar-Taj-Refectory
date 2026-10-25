import { useEffect, useState } from "react";
import { BellOff, CheckCircle2, Clock, Info, Loader2, Ban } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getNotifications } from "../../api";
import type { Notification, NotificationKind } from "../../api";
import { Card } from "../../components/ui/Card";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { cx } from "../../lib/cx";

type TabId = "all" | "bookings" | "system" | "alerts";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "bookings", label: "Bookings" },
  { id: "system", label: "System" },
  { id: "alerts", label: "Alerts" },
];

// Notifications carry no category yet, so tabs group by kind.
// When the backend adds a `category` field, change this one map.
const TAB_KINDS: Record<Exclude<TabId, "all">, NotificationKind[]> = {
  bookings: ["success"],
  system: ["info"],
  alerts: ["warning", "danger"],
};

const KIND_META: Record<NotificationKind, { icon: LucideIcon; tile: string }> = {
  success: { icon: CheckCircle2, tile: "bg-success-soft text-success" },
  info: { icon: Info, tile: "bg-info-soft text-info" },
  warning: { icon: Clock, tile: "bg-peach text-accent" },
  danger: { icon: Ban, tile: "bg-danger-soft text-danger" },
};

function matchesTab(n: Notification, tab: TabId): boolean {
  return tab === "all" || TAB_KINDS[tab].includes(n.kind);
}

/** Display-only formatting: "Just now", "5 minutes ago", "2 hours ago", "3 days ago". */
function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const units: [number, string][] = [
    [60 * 60 * 24 * 30, "month"],
    [60 * 60 * 24 * 7, "week"],
    [60 * 60 * 24, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? "" : "s"} ago`;
    }
  }
  return "Just now";
}

export function Notifications() {
  const [items, setItems] = useState<Notification[]>([]);
  const [tab, setTab] = useState<TabId>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getNotifications()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load notifications.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = items.filter((n) => matchesTab(n, tab));
  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <SectionHeader
        as="h1"
        eyebrow="Stay informed"
        title="Notifications"
        description={
          unreadCount > 0
            ? `You have ${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}.`
            : "You're all caught up."
        }
      />

      {/* Tabs */}
      <div role="tablist" aria-label="Notification categories" className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          const count = items.filter((n) => matchesTab(n, id)).length;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              id={`notif-tab-${id}`}
              aria-selected={active}
              aria-controls="notif-panel"
              onClick={() => setTab(id)}
              className={cx(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active
                  ? "bg-ink text-white"
                  : "border border-line bg-card text-ink/70 hover:border-ink/25 hover:text-ink",
              )}
            >
              {label}
              {!loading && count > 0 ? (
                <span
                  className={cx(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    active ? "bg-white/20 text-white" : "bg-[#F4EEE8] text-ink/60",
                  )}
                >
                  {count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <Card
        as="section"
        padding="none"
        role="tabpanel"
        id="notif-panel"
        aria-labelledby={`notif-tab-${tab}`}
        className="overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-10 text-ink/60">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            Loading notifications…
          </div>
        ) : error ? (
          <p role="alert" className="bg-danger-soft p-6 text-danger">
            {error}
          </p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-peach text-accent" aria-hidden="true">
              <BellOff className="size-7" />
            </span>
            <p className="font-serif text-xl font-semibold">Nothing here yet</p>
            <p className="max-w-xs text-sm text-ink/60">
              {tab === "all"
                ? "New updates about your meals will show up here."
                : "No notifications in this category right now."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((n) => {
              const { icon: Icon, tile } = KIND_META[n.kind];
              return (
                <li key={n.id} className={cx("flex items-start gap-4 p-4 sm:p-5", !n.read && "bg-peach/25")}>
                  <span
                    className={cx("flex size-11 shrink-0 items-center justify-center rounded-xl", tile)}
                    aria-hidden="true"
                  >
                    <Icon className="size-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium text-ink">
                        {n.title}
                        {!n.read ? <span className="sr-only"> (unread)</span> : null}
                      </p>
                      {!n.read ? (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-ink/70">{n.body}</p>
                    <time dateTime={n.createdAt} className="mt-1 block text-xs text-ink/50">
                      {relativeTime(n.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default Notifications;