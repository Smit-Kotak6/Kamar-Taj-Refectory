import { useEffect, useState } from 'react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

type Day = { date: string; meals: Array<{ mealType: string; booked: number; closed: boolean }> }
type DemandData = { startDate: string; days: Day[] }
const mealTypes = ['breakfast', 'lunch', 'dinner'] as const

export function Demand() {
  const [data, setData] = useState<DemandData | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    http<DemandData>('/api/admin/demand')
      .then(result => { if (active) { setData(result); setError('') } })
      .catch(reason => { if (active) { setData(null); setError(reason instanceof Error ? reason.message : 'Could not load demand.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh])

  const total = data?.days.reduce((sum, day) => sum + day.meals.reduce((count, meal) => count + meal.booked, 0), 0) ?? 0
  return <div className="space-y-6">
    <div><h1 className="font-serif text-3xl font-bold text-ink">Upcoming booked demand</h1><p className="mt-2 text-ink/70">Recorded bookings for the next seven calendar days, starting today.</p></div>
    <Card role="note" className="border-amber-300 bg-amber-50 text-amber-950"><p className="text-sm"><strong>Planning note:</strong> These are current booking counts, not a prediction of how many students will eat. More bookings can be added before cutoff. Students without recorded bookings are not included.</p></Card>
    <Button variant="secondary" onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>Refresh counts</Button>
    {error && <Card><p role="alert" className="text-danger">{error}</p></Card>}
    {loading ? <p aria-busy="true">Loading booked demand…</p> : data && <>
      <Card><p className="text-sm text-ink/60">Recorded bookings in this period</p><p className="mt-2 font-serif text-3xl font-semibold">{total}</p></Card>
      <Card as="section" padding="none" className="overflow-hidden"><h2 className="px-5 pt-5 font-serif text-xl font-semibold">Daily meal counts</h2><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="px-5 py-3">Date</th>{mealTypes.map(type => <th key={type} className="capitalize">{type}</th>)}</tr></thead><tbody>{data.days.map(day => <tr key={day.date} className="border-b border-line last:border-0"><td className="px-5 py-3">{day.date}</td>{mealTypes.map(type => { const meal = day.meals.find(row => row.mealType === type); return <td key={type} className="py-3">{meal?.closed ? `Closed (${meal.booked})` : meal?.booked ?? 0}</td> })}</tr>)}</tbody></table></div></Card>
      <p className="text-sm text-ink/60">Booked includes meals already redeemed today. A closed meal is labelled even if an existing booking record remains. A predictive forecast requires a separate model and reliable booking history.</p>
    </>}
  </div>
}
