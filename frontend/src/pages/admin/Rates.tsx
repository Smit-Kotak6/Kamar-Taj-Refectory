import { useCallback, useEffect, useState } from 'react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

type Meal = 'breakfast' | 'lunch' | 'dinner'
type Rate = { mealType: Meal; amountPaise: number; basePaise: number; overridePaise: number | null }
type Response = { date: string; rates: Rate[] }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const rupees = (paise: number) => (paise / 100).toFixed(2)
const toPaise = (input: string) => /^\d{1,5}(?:\.\d{1,2})?$/.test(input) && Number(input) <= 10000 ? Math.round(Number(input) * 100) : null

export function Rates() {
  const [date, setDate] = useState(today)
  const [data, setData] = useState<Response | null>(null)
  const [defaultInputs, setDefaultInputs] = useState<Record<string, string>>({})
  const [dayInputs, setDayInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (day: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await http<Response>(`/api/admin/rates?date=${encodeURIComponent(day)}`)
      setData(result)
      setDefaultInputs(Object.fromEntries(result.rates.map(rate => [rate.mealType, rupees(rate.basePaise)])))
      setDayInputs(Object.fromEntries(result.rates.map(rate => [rate.mealType, rupees(rate.overridePaise ?? rate.basePaise)])))
    } catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : 'Could not load rates.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(date) }, [date, load])

  async function save(meal: Meal, kind: 'default' | 'day') {
    const amountPaise = toPaise(kind === 'default' ? defaultInputs[meal] : dayInputs[meal])
    if (amountPaise === null) { setMessage('Enter an amount from ₹0 to ₹10,000, with at most two decimal places.'); return }
    setBusy(true); setMessage('')
    try {
      if (kind === 'default') await http(`/api/admin/rates/defaults/${meal}`, { method: 'PUT', body: { effectiveFrom: date, amountPaise } })
      else await http(`/api/admin/rates/overrides/${date}/${meal}`, { method: 'PUT', body: { amountPaise } })
      await load(date)
      setMessage(kind === 'default' ? `${meal} default saved from ${date}.` : `${meal} rate saved for ${date} only.`)
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not save rate.') }
    finally { setBusy(false) }
  }
  async function clear(meal: Meal) {
    setBusy(true); setMessage('')
    try { await http(`/api/admin/rates/overrides/${date}/${meal}`, { method: 'DELETE' }); await load(date); setMessage(`${meal} one-day rate removed.`) }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Could not remove rate.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-6">
    <div><h1 className="font-serif text-3xl font-bold text-ink">Meal rates</h1><p className="mt-2 text-ink/70">Set a default from an effective date, or replace it for just one meal on one date.</p></div>
    <Card role="note" className="border-amber-300 bg-amber-50 text-amber-950"><p className="text-sm">Starting rates: breakfast ₹30, lunch ₹60, dinner ₹50. Rate edits affect the student’s estimated bill for the chosen date. Existing bills are not finalized or paid here.</p></Card>
    <label className="block text-sm font-medium">Date to view or edit<input type="date" value={date} onChange={event => { if (event.target.value) { setMessage(''); setDate(event.target.value) } }} className="mt-1 block h-11 rounded-xl border border-line bg-white px-3" /></label>
    <p className="text-sm text-ink/60">You can view older dates, but rate edits are allowed only for today or future dates.</p>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {message && <p role="status" className="text-sm text-ink">{message}</p>}
    {loading ? <p aria-busy="true">Loading rates…</p> : data && <div className="grid gap-4 lg:grid-cols-3">{data.rates.map(rate => <Card key={rate.mealType} className="space-y-4">
      <div><h2 className="font-serif text-xl font-semibold capitalize">{rate.mealType}</h2><p className="text-sm text-ink/60">Current rate for {date}: ₹{rupees(rate.amountPaise)}{rate.overridePaise !== null ? ' (one-day override)' : ''}</p></div>
      <div><label className="text-sm">Default rate from {date} (₹)<input inputMode="decimal" value={defaultInputs[rate.mealType] ?? ''} onChange={event => setDefaultInputs(values => ({ ...values, [rate.mealType]: event.target.value }))} className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label><Button className="mt-2" disabled={busy || date < today()} onClick={() => void save(rate.mealType, 'default')}>Save default</Button></div>
      <div className="border-t border-line pt-4"><label className="text-sm">This date only (₹)<input inputMode="decimal" value={dayInputs[rate.mealType] ?? ''} onChange={event => setDayInputs(values => ({ ...values, [rate.mealType]: event.target.value }))} className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label><div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy || date < today()} onClick={() => void save(rate.mealType, 'day')}>Save this date</Button>{rate.overridePaise !== null && <Button variant="secondary" disabled={busy || date < today()} onClick={() => void clear(rate.mealType)}>Remove override</Button>}</div></div>
    </Card>)}</div>}
  </div>
}
