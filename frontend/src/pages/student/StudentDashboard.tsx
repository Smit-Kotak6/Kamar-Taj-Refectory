import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, CalendarDays, Check, Clock, Leaf, UtensilsCrossed, XCircle } from 'lucide-react'
import { getMeals, MEAL_TYPES, MESS_CLOSED_LABEL, setMealBooking } from '../../api'
import type { Meal, MealType } from '../../api'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { GradientHero } from '../../components/ui/GradientHero'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { StatCard } from '../../components/ui/StatCard'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useCountdown } from '../../hooks/useCountdown'
import { useNow } from '../../hooks/useNow'
import { cx } from '../../lib/cx'
import { MEAL_LABEL, countConfirmed, defaultTab, formatLongDate, formatTime, getMealActions, mealVisual, nextCutoffMeal } from '../../lib/dashboard'

type Activity = { totals: { booked: number; redeemed: number; cancelled: number } }
const todayInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function Countdown({ target }: { target: string }) {
  const { formatted, isExpired } = useCountdown(target)
  return <>{isExpired ? 'Closed' : formatted}</>
}

function MealCard({ meal, now, busy, onBook }: { meal: Meal; now: number; busy: boolean; onBook: (meal: Meal, booked: boolean) => void }) {
  const { emoji, gradient } = mealVisual(meal)
  const actions = getMealActions(meal, now)
  return <Card as="article" padding="none" className="flex flex-col overflow-hidden">
    <div className={cx('flex h-36 items-center justify-center bg-gradient-to-br', gradient, meal.closed && 'opacity-60 grayscale')} aria-hidden="true"><span className="text-6xl">{emoji}</span></div>
    <div className="flex flex-1 flex-col gap-3 p-4">
      <div><h3 className="font-serif text-xl font-semibold">{meal.title}</h3><p className="mt-1 text-sm text-ink/65">{meal.description}</p></div>
      {!meal.closed && <StatusBadge status={meal.status} className="self-start" />}
      <div className="mt-auto pt-1">{meal.closed ? <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-center text-sm font-semibold text-danger">{MESS_CLOSED_LABEL}</p> :
        <div className="flex gap-2">
          <span className="flex-1" title={actions.optInHint}><Button size="sm" fullWidth leftIcon={<Check className="size-4" />} disabled={!actions.canOptIn || busy} loading={busy && actions.canOptIn} onClick={() => onBook(meal, true)}>Opt In</Button></span>
          <span className="flex-1" title={actions.cancelHint}><Button size="sm" variant="secondary" fullWidth disabled={!actions.canCancel || busy} loading={busy && actions.canCancel} onClick={() => onBook(meal, false)}>Cancel</Button></span>
        </div>}
      </div>
    </div>
  </Card>
}

export function StudentDashboard() {
  const navigate = useNavigate()
  const day = useMemo(todayInIndia, [])
  const month = day.slice(0, 7)
  const now = useNow()
  const [meals, setMeals] = useState<Meal[]>([])
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [mealError, setMealError] = useState('')
  const [activityError, setActivityError] = useState('')
  const [actionError, setActionError] = useState('')
  const [tab, setTab] = useState<MealType | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const loadActivity = useCallback(async () => {
    try { setActivity((await http<Activity>(`/api/student/billing?month=${encodeURIComponent(month)}`))); setActivityError('') }
    catch (error) { setActivity(null); setActivityError(error instanceof Error ? error.message : 'Could not load activity.') }
  }, [month])

  useEffect(() => {
    let active = true
    getMeals(day).then(rows => { if (active) setMeals(rows) })
      .catch(error => { if (active) setMealError(error instanceof Error ? error.message : 'Could not load meals.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [day])
  useEffect(() => { void loadActivity() }, [loadActivity])

  const handleBook = useCallback(async (meal: Meal, booked: boolean) => {
    setPendingId(meal.id); setActionError('')
    try {
      const updated = await setMealBooking(meal.id, booked)
      setMeals(rows => rows.map(row => row.id === updated.id ? updated : row))
      void loadActivity()
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not update booking.') }
    finally { setPendingId(null) }
  }, [loadActivity])

  const activeTab = tab ?? defaultTab(meals, now)
  const selectedMeals = meals.filter(meal => meal.type === activeTab)
  const confirmed = countConfirmed(meals)
  const next = nextCutoffMeal(meals, now)

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 sm:gap-8">
    <GradientHero eyebrow="Kamar-Taj Refectory" title={<>Your meals.<br />Your choice.<br />Less waste.</>} subtitle="Book campus meals and manage your preferences." aside={<Card className="mx-auto w-full max-w-sm border-white/40 bg-white/85 backdrop-blur lg:ml-auto"><UtensilsCrossed className="size-8 text-success" /><p className="mt-3 text-sm text-ink/65">Your redeemed meals this month</p><p className="font-serif text-4xl font-semibold">{activity?.totals.redeemed ?? '—'}</p><p className="mt-1 text-sm text-ink/65">Based on recorded staff check-ins</p></Card>}>
      <Button size="lg" rightIcon={<ArrowRight className="size-5" />} onClick={() => document.getElementById('todays-menu')?.scrollIntoView({ behavior: 'smooth' })}>Explore today&apos;s meals</Button>
      <Button size="lg" variant="secondary" leftIcon={<CalendarDays className="size-5" />} onClick={() => navigate('/student/meals')}>Manage my meals</Button>
    </GradientHero>
    {mealError && <Card><p role="alert" className="text-danger">{mealError}</p><Button size="sm" className="mt-2" onClick={() => window.location.reload()}>Retry</Button></Card>}
    {activityError && <p role="alert" className="text-sm text-danger">Monthly activity unavailable: {activityError}</p>}
    <section aria-label="Your day at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Today's meals confirmed" value={loading ? '—' : `${confirmed}/${meals.length || MEAL_TYPES.length}`} icon={UtensilsCrossed} tone="lilac" subtitle="Saved bookings" />
      <StatCard label="Cancellation deadline" value={next ? <Countdown target={next.cutoffAt} /> : '—'} icon={Clock} tone="peach" subtitle={next ? `${MEAL_LABEL[next.type]} cutoff · ${formatTime(next.cutoffAt)}` : 'No more cutoffs today'} />
      <StatCard label="Redeemed this month" value={activity?.totals.redeemed ?? '—'} icon={Check} tone="green" subtitle="Staff check-ins" />
      <StatCard label="Cancelled this month" value={activity?.totals.cancelled ?? '—'} icon={XCircle} tone="blue" subtitle="Recorded cancellations" />
    </section>
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section id="todays-menu" className="min-w-0 scroll-mt-4">
        <SectionHeader eyebrow="Today's meals" title="Choose your meals" description={formatLongDate()} action={<div role="tablist" aria-label="Meal" className="inline-flex rounded-xl border border-line bg-card p-1">{MEAL_TYPES.map(type => <button key={type} type="button" role="tab" aria-selected={activeTab === type} onClick={() => setTab(type)} className={cx('h-9 rounded-lg px-4 text-sm font-medium', activeTab === type ? 'bg-ink text-white' : 'text-ink/70 hover:bg-peach/60')}>{MEAL_LABEL[type]}</button>)}</div>} />
        {actionError && <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{actionError}</p>}
        <div className="mt-5" role="tabpanel">{loading ? <div className="h-72 animate-pulse rounded-2xl bg-card" /> : selectedMeals.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{selectedMeals.map(meal => <MealCard key={meal.id} meal={meal} now={now} busy={pendingId === meal.id} onBook={handleBook} />)}</div> : <Card className="text-center text-ink/65">No {MEAL_LABEL[activeTab].toLowerCase()} available today.</Card>}</div>
      </section>
      <aside><Card padding="lg" className="lg:sticky lg:top-4"><h2 className="font-serif text-lg font-semibold">Cancellation deadline</h2>{next ? <><p className="mt-4 font-serif text-4xl font-semibold text-accent"><Countdown target={next.cutoffAt} /></p><p className="mt-2 text-sm text-ink/65">{MEAL_LABEL[next.type]} · {formatTime(next.cutoffAt)}</p></> : <p className="mt-4 text-sm text-ink/65">No more cutoffs today.</p>}<div className="mt-6 border-t border-line pt-5"><h3 className="flex items-center gap-2 font-semibold"><Leaf className="size-4 text-success" />Why booking helps</h3><p className="mt-2 text-sm text-ink/65">Your booking gives the kitchen a clearer meal count. Food waste is measured separately by the kitchen.</p></div></Card></aside>
    </div>
  </div>
}
