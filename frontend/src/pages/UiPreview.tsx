import { useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Clock, Leaf, TrendingUp, Users, UtensilsCrossed } from "lucide-react";
import type { BookingStatus } from "../api/types";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CountdownChip } from "../components/ui/CountdownChip";
import { GradientHero } from "../components/ui/GradientHero";
import { SectionHeader } from "../components/ui/SectionHeader";
import { StatCard } from "../components/ui/StatCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { Toggle } from "../components/ui/Toggle";

const ALL_STATUSES: BookingStatus[] = [
  "BOOKED",
  "LOCKED",
  "REDEEMED",
  "EXPIRED_UNCONSUMED",
  "CANCELLED_BY_STUDENT",
  "ON_LEAVE",
  "CANCELLED_MESS_CLOSED",
];

export function UiPreview() {
  const [breakfast, setBreakfast] = useState(true);
  const [lunch, setLunch] = useState(true);
  const [dinner, setDinner] = useState(false);

  // Demo targets: 2h 15m away, 10 minutes away, and already passed.
  const { later, soon, past } = useMemo(() => {
    const now = Date.now();
    return {
      later: new Date(now + (2 * 60 + 15) * 60_000),
      soon: new Date(now + 10 * 60_000),
      past: new Date(now - 60_000),
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
      <GradientHero
        eyebrow="Kamar-Taj Refectory"
        title={
          <>
            Your meals.
            <br />
            Less waste.
          </>
        }
        subtitle="Book your campus meals, manage your preferences and help us reduce food waste together."
      >
        <Button size="lg" rightIcon={<ArrowRight className="size-4" />}>
          Explore today&apos;s menu
        </Button>
        <Button size="lg" variant="secondary" leftIcon={<CalendarDays className="size-4" />}>
          Manage my meals
        </Button>
      </GradientHero>

      <section className="space-y-4">
        <SectionHeader eyebrow="Stat cards" title="Today at a glance" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Confirmed Meals"
            value={428}
            icon={Users}
            tone="peach"
            trend={{ label: "12%", direction: "up" }}
            subtitle="out of 520 expected"
          />
          <StatCard
            label="Opt-in Rate"
            value="82%"
            icon={TrendingUp}
            tone="green"
            trend={{ label: "6%", direction: "up" }}
            subtitle="vs last week"
          />
          <StatCard
            label="Cancellation Cutoff"
            value="2h 15m"
            icon={Clock}
            tone="lilac"
            subtitle="left for Dinner"
          />
          <StatCard
            label="Waste This Week"
            value="14.1 kg"
            icon={Leaf}
            tone="blue"
            trend={{ label: "23%", direction: "down", sentiment: "positive" }}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Badges" title="Statuses" />
        <Card className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="danger">Danger</Badge>
            <Badge variant="info">Info</Badge>
            <Badge variant="neutral">Neutral</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Countdown" title="Cancellation deadlines" />
        <Card className="flex flex-wrap items-center gap-3">
          <CountdownChip target={later} />
          <CountdownChip target={soon} />
          <CountdownChip target={past} />
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeader eyebrow="Buttons and toggles" title="Book your meal" />
        <Card className="space-y-5">
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
            <Button loading>Saving</Button>
          </div>
          <ul className="divide-y divide-line">
            {[
              { name: "Breakfast", checked: breakfast, set: setBreakfast },
              { name: "Lunch", checked: lunch, set: setLunch },
              { name: "Dinner", checked: dinner, set: setDinner },
            ].map(({ name, checked, set }) => (
              <li key={name} className="flex items-center justify-between py-3">
                <span className="flex items-center gap-2 font-medium">
                  <UtensilsCrossed className="size-4 text-accent" aria-hidden="true" />
                  {name}
                </span>
                <Toggle label={`Opt in to ${name}`} checked={checked} onChange={set} />
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </main>
  );
}