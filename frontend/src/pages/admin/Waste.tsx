import { useCallback, useEffect, useState } from 'react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

type Meal = 'breakfast' | 'lunch' | 'dinner'
type RecordRow = { id: string; date: string; mealType: Meal; preparedGrams: number; wastedGrams: number; note: string; updatedAt: string }
type WasteData = { month: string; totals: { preparedGrams: number; wastedGrams: number; wastePercent: number | null }; records: RecordRow[] }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const kg = (grams: number) => (grams / 1000).toFixed(3)
const toGrams = (value: string) => /^\d{1,5}(?:\.\d{1,3})?$/.test(value) && Number(value) <= 10000 ? Math.round(Number(value) * 1000) : null

export function Waste() {
  const [date, setDate] = useState(today)
  const [meal, setMeal] = useState<Meal>('breakfast')
  const [prepared, setPrepared] = useState('')
  const [wasted, setWasted] = useState('')
  const [note, setNote] = useState('')
  const [data, setData] = useState<WasteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const month = date.slice(0, 7)

  const load = useCallback(async (key: string) => {
    setLoading(true); setError('')
    try { setData(await http<WasteData>(`/api/admin/waste?month=${encodeURIComponent(key)}`)) }
    catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : 'Could not load waste records.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(month) }, [month, load])
  useEffect(() => {
    const existing = data?.records.find(row => row.date === date && row.mealType === meal)
    setPrepared(existing ? kg(existing.preparedGrams) : '')
    setWasted(existing ? kg(existing.wastedGrams) : '')
    setNote(existing?.note ?? '')
  }, [data, date, meal])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const preparedGrams = toGrams(prepared)
    const wastedGrams = toGrams(wasted)
    if (preparedGrams === null || wastedGrams === null || wastedGrams > preparedGrams || note.length > 500) {
      setMessage('Enter valid measured kilograms (up to three decimals). Waste cannot exceed prepared food.'); return
    }
    setSaving(true); setMessage('')
    try {
      await http(`/api/admin/waste/${date}/${meal}`, { method: 'PUT', body: { preparedGrams, wastedGrams, note } })
      await load(month)
      setMessage('Measured waste saved.')
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save measurement.') }
    finally { setSaving(false) }
  }

  return <div className="space-y-6">
    <div><h1 className="font-serif text-3xl font-bold text-ink">Waste & sustainability</h1><p className="mt-2 text-ink/70">Log measured prepared and leftover food. Monthly percentages use total weighed kilograms.</p></div>
    <Card role="note" className="border-amber-300 bg-amber-50 text-amber-950"><p className="text-sm">Enter actual kitchen measurements. Meal bookings and check-ins cannot determine food waste in kilograms.</p></Card>
    <Card as="form" onSubmit={save} className="space-y-4">
      <h2 className="font-serif text-xl font-semibold">Record a meal</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">Date<input required type="date" value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setMessage('') } }} className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label>
        <label className="text-sm">Meal<select value={meal} onChange={event => { setMeal(event.target.value as Meal); setMessage('') }} className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option></select></label>
        <label className="text-sm">Prepared (kg)<input required inputMode="decimal" value={prepared} onChange={event => setPrepared(event.target.value)} placeholder="e.g. 35.500" className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label>
        <label className="text-sm">Wasted (kg)<input required inputMode="decimal" value={wasted} onChange={event => setWasted(event.target.value)} placeholder="e.g. 2.250" className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label>
      </div>
      <label className="block text-sm">Notes (optional)<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} rows={2} className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2" /></label>
      <Button type="submit" loading={saving}>Save measurement</Button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </Card>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {loading ? <p aria-busy="true">Loading measurements…</p> : data && <>
      <div className="grid gap-4 sm:grid-cols-3"><Card><p className="text-sm text-ink/60">Prepared this month</p><p className="mt-2 font-serif text-2xl font-semibold">{kg(data.totals.preparedGrams)} kg</p></Card><Card><p className="text-sm text-ink/60">Wasted this month</p><p className="mt-2 font-serif text-2xl font-semibold">{kg(data.totals.wastedGrams)} kg</p></Card><Card><p className="text-sm text-ink/60">Waste share</p><p className="mt-2 font-serif text-2xl font-semibold">{data.totals.wastePercent === null ? '—' : `${data.totals.wastePercent}%`}</p></Card></div>
      <Card as="section" padding="none" className="overflow-hidden"><h2 className="px-5 pt-5 font-serif text-xl font-semibold">Measurements for {month}</h2>{data.records.length === 0 ? <p className="p-5 text-sm text-ink/60">No measured waste recorded for this month.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-line text-ink/60"><th className="px-5 py-3">Date</th><th>Meal</th><th>Prepared</th><th>Wasted</th><th>Notes</th></tr></thead><tbody>{data.records.map(row => <tr key={row.id} className="border-b border-line last:border-0"><td className="px-5 py-3">{row.date}</td><td className="capitalize">{row.mealType}</td><td>{kg(row.preparedGrams)} kg</td><td>{kg(row.wastedGrams)} kg</td><td>{row.note || '—'}</td></tr>)}</tbody></table></div>}</Card>
    </>}
  </div>
}
