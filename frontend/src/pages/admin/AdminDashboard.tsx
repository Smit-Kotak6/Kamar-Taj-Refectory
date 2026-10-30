import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, CheckCircle2, Clock, RefreshCw, Users, UtensilsCrossed } from 'lucide-react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { GradientHero } from '../../components/ui/GradientHero'
import { StatCard } from '../../components/ui/StatCard'

type MealSummary = {
  mealType: string
  booked: number
  redeemed: number
  cancelled: number
  closed: boolean
  serviceStart: string | null
  serviceEnd: string | null
  cutoffAt: string | null
}
type Overview = {
  date: string
  activeMembers: number
  meals: MealSummary[]
  totals: { booked: number; redeemed: number; cancelled: number }
}
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function time(value: string | null) {
  return value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : 'Not configured'
}

export function AdminDashboard() {
  const [date, setDate] = useState(todayIST)
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (day: string) => {
    setLoading(true)
    setError('')
    try { setData(await http<Overview>(`/api/admin/overview?date=${encodeURIComponent(day)}`)) }
    catch (e) { setData(null); setError(e instanceof Error ? e.message : 'Could not load overview.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(date) }, [date, load])

  return <div className="space-y-6 sm:space-y-8">
    <GradientHero eyebrow="Kitchen overview" title="Today's mess at a glance" subtitle="Live membership, booking and redemption records from your database.">
      <Link to="/admin/memberships" className="rounded-xl bg-white px-4 py-2.5 font-medium text-ink">Manage memberships</Link>
      <Link to="/admin/closures" className="rounded-xl border border-white/70 px-4 py-2.5 font-medium text-white">Manage closures</Link>
    </GradientHero>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium text-ink">View date<input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 block h-11 rounded-xl border border-line bg-white px-3" /></label>
      <Button variant="secondary" leftIcon={<RefreshCw className="size-4" />} onClick={() => void load(date)}>Refresh</Button>
      <span className="text-sm text-ink/60">Counts reflect recorded bookings only.</span>
    </div>
    {error && <Card><p role="alert" className="text-danger">{error}</p></Card>}
    {loading ? <p aria-busy="true">Loading overview…</p> : data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active members" value={data.activeMembers} icon={Users} tone="blue" subtitle="Membership active on this date" />
        <StatCard label="Recorded bookings" value={data.totals.booked} icon={UtensilsCrossed} tone="peach" subtitle="Booked or redeemed meals" />
        <StatCard label="Meals redeemed" value={data.totals.redeemed} icon={CheckCircle2} tone="green" subtitle="QR or manual check-ins" />
        <StatCard label="Cancelled bookings" value={data.totals.cancelled} icon={Clock} tone="lilac" subtitle="User, leave or mess closure" />
      </div>
      <section aria-label="Meals" className="grid gap-4 lg:grid-cols-3">
        {data.meals.map(m => <Card key={m.mealType} as="article" className="space-y-4">
          <div className="flex items-center justify-between gap-2"><h2 className="font-serif text-xl font-semibold capitalize text-ink">{m.mealType}</h2><span className={m.closed ? 'rounded-full bg-danger-soft px-3 py-1 text-sm text-danger' : 'rounded-full bg-success-soft px-3 py-1 text-sm text-success'}>{m.closed ? 'Mess closed' : 'Open'}</span></div>
          <p className="text-sm text-ink/65">Service: {time(m.serviceStart)} – {time(m.serviceEnd)}</p>
          <p className="text-sm text-ink/65">Cancellation cutoff: {time(m.cutoffAt)}</p>
          <div className="grid grid-cols-3 gap-2 border-t border-line pt-4 text-center"><div><p className="font-serif text-2xl font-semibold">{m.booked}</p><p className="text-xs text-ink/60">Booked</p></div><div><p className="font-serif text-2xl font-semibold">{m.redeemed}</p><p className="text-xs text-ink/60">Redeemed</p></div><div><p className="font-serif text-2xl font-semibold">{m.cancelled}</p><p className="text-xs text-ink/60">Cancelled</p></div></div>
        </Card>)}
      </section>
      <Card className="flex items-center gap-3 text-sm text-ink/70"><CalendarDays className="size-5 shrink-0" /><p>Forecast and waste figures are unavailable until real forecasting and measured waste records are connected. Meal counts above come from recorded bookings.</p></Card>
    </>}
  </div>
}
