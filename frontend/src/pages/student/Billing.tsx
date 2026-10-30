import { useEffect, useState } from 'react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'

type MealRecord = { id: string; date: string; mealType: string; status: string; redeemedAt: string | null; chargePaise: number; rebatePaise: number }
type Activity = {
  month: string
  totals: { booked: number; redeemed: number; cancelled: number }
  meals: MealRecord[]
  billingConfigured: true
  policy: string
  amounts: { grossPaise: number; rebatePaise: number; netPaise: number }
}
const monthInIndia = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date())
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
const statusText: Record<string, string> = {
  BOOKED: 'Booked', REDEEMED: 'Redeemed', CANCELLED_USER: 'Cancelled by you',
  CANCELLED_LEAVE: 'Cancelled for leave', CANCELLED_CLOSED: 'Mess closed',
}

export default function Billing() {
  const [month, setMonth] = useState(monthInIndia)
  const [refresh, setRefresh] = useState(0)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    http<Activity>(`/api/student/billing?month=${encodeURIComponent(month)}`)
      .then(data => { if (active) { setActivity(data); setError('') } })
      .catch(reason => { if (active) { setActivity(null); setError(reason instanceof Error ? reason.message : 'Could not load meal activity.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [month, refresh])

  const cancellations = activity?.meals.filter(meal => meal.status.startsWith('CANCELLED_')) ?? []

  return <div className="space-y-6">
    <SectionHeader as="h1" eyebrow="Billing" title="Meal activity & billing" description="Estimated meal charges for the selected month, based on saved bookings and admin rates." />
    <Card role="note" className="border-amber-300 bg-amber-50 text-amber-950">
      <h2 className="font-semibold">Estimate, not a finalized invoice</h2>
      <p className="mt-1 text-sm">Each recorded booking uses its meal rate. A cancelled booking gets an equal offset, so it adds ₹0 to the estimate. This page does not track payments or an outstanding balance. Admin rate changes can recalculate these estimates.</p>
    </Card>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium text-ink">Month<input type="month" value={month} onChange={event => { if (event.target.value) { setLoading(true); setMonth(event.target.value) } }} className="mt-1 block h-11 rounded-xl border border-line bg-white px-3" /></label>
      <Button variant="secondary" onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>Refresh</Button>
    </div>
    {error && <Card><p role="alert" className="text-danger">{error}</p></Card>}
    {loading ? <p aria-busy="true">Loading meal activity…</p> : activity && <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-ink/60">Gross meal charges</p><p className="mt-2 font-serif text-2xl font-semibold">{money(activity.amounts.grossPaise)}</p></Card>
        <Card><p className="text-sm text-ink/60">Cancellation offsets</p><p className="mt-2 font-serif text-2xl font-semibold">{money(activity.amounts.rebatePaise)}</p></Card>
        <Card><p className="text-sm text-ink/60">Estimated net charges</p><p className="mt-2 font-serif text-2xl font-semibold">{money(activity.amounts.netPaise)}</p></Card>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-sm text-ink/60">Recorded bookings</p><p className="mt-2 font-serif text-3xl font-semibold">{activity.totals.booked}</p></Card>
        <Card><p className="text-sm text-ink/60">Redeemed meals</p><p className="mt-2 font-serif text-3xl font-semibold">{activity.totals.redeemed}</p></Card>
        <Card><p className="text-sm text-ink/60">Cancelled bookings</p><p className="mt-2 font-serif text-3xl font-semibold">{activity.totals.cancelled}</p></Card>
      </div>
      <Card as="section" padding="none" className="overflow-hidden">
        <h2 className="px-5 pt-5 font-serif text-xl font-semibold">Meal records</h2>
        {activity.meals.length === 0 ? <p className="p-5 text-sm text-ink/60">No recorded bookings for this month.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="px-5 py-3">Date</th><th>Meal</th><th>Status</th><th>Rate</th><th>Net</th></tr></thead><tbody>{activity.meals.map(meal => <tr key={meal.id} className="border-b border-line last:border-0"><td className="px-5 py-3">{meal.date}</td><td className="capitalize">{meal.mealType}</td><td>{statusText[meal.status] ?? meal.status}</td><td>{money(meal.chargePaise)}</td><td>{money(meal.chargePaise - meal.rebatePaise)}</td></tr>)}</tbody></table></div>}
      </Card>
      <Card as="section" padding="none" className="overflow-hidden">
        <h2 className="px-5 pt-5 font-serif text-xl font-semibold">Rebate ledger</h2>
        <p className="px-5 pt-1 text-sm text-ink/60">Each cancellation offsets its estimated meal charge. This is not a paid refund or a separate credit balance.</p>
        {cancellations.length === 0 ? <p className="p-5 text-sm text-ink/60">No recorded cancellations for this month.</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="px-5 py-3">Date</th><th>Meal</th><th>Reason</th><th>Offset</th></tr></thead><tbody>{cancellations.map(meal => <tr key={meal.id} className="border-b border-line last:border-0"><td className="px-5 py-3">{meal.date}</td><td className="capitalize">{meal.mealType}</td><td>{statusText[meal.status] ?? meal.status}</td><td>{money(meal.rebatePaise)}</td></tr>)}</tbody></table></div>}
      </Card>
      <p className="text-sm text-ink/60">Booked includes redeemed meals. A booked meal without a redemption record is not counted as eaten. Months with no saved bookings show no activity.</p>
    </>}
  </div>
}
