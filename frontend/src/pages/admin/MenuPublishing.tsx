import { useCallback, useEffect, useState } from 'react'
import { ApiError, http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

type MealType = 'breakfast' | 'lunch' | 'dinner'
type Menu = { title: string; description: string; updatedAt: string }
type MealRow = { mealType: MealType; menu: Menu | null; editable: boolean }
type DayMenu = { date: string; meals: MealRow[] }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

function MenuEditor({ date, row, onChanged }: { date: string; row: MealRow; onChanged: () => Promise<void> }) {
  const [title, setTitle] = useState(row.menu?.title ?? '')
  const [description, setDescription] = useState(row.menu?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function publish(event: React.FormEvent) {
    event.preventDefault()
    if (!row.editable) return
    const name = title.trim()
    if (name.length < 2 || name.length > 120 || description.trim().length > 500) { setMessage('Enter a title of 2–120 characters and notes up to 500 characters.'); return }
    setBusy(true); setMessage('')
    try {
      await http(`/api/admin/menu/${date}/${row.mealType}`, { method: 'PUT', body: { title: name, description: description.trim() } })
      await onChanged()
      setMessage('Published. Students can now see this menu.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not publish menu.')
      if (error instanceof ApiError && error.status === 409) await onChanged()
    }
    finally { setBusy(false) }
  }

  async function unpublish() {
    if (!row.editable) return
    setBusy(true); setMessage('')
    try {
      await http(`/api/admin/menu/${date}/${row.mealType}`, { method: 'DELETE' })
      setTitle(''); setDescription('')
      await onChanged()
      setMessage('Unpublished. Students will see a menu unavailable message.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not unpublish menu.')
      if (error instanceof ApiError && error.status === 409) await onChanged()
    }
    finally { setBusy(false) }
  }

  return <Card as="form" onSubmit={publish} className="space-y-4">
    <div><h2 className="font-serif text-xl font-semibold capitalize">{row.mealType}</h2><p className="text-sm text-ink/60">{row.menu ? 'Published' : 'Not published'}{!row.editable && ' · Locked'}</p></div>
    <label className="block text-sm">Menu title<input required disabled={!row.editable || busy} maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Dal, rice and vegetables" className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3 disabled:opacity-60" /></label>
    <label className="block text-sm">Description or dishes (optional)<textarea disabled={!row.editable || busy} maxLength={500} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="Write the dishes the kitchen will serve" className="mt-1 block w-full rounded-xl border border-line bg-white px-3 py-2 disabled:opacity-60" /></label>
    {row.editable ? <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy}>{row.menu ? 'Update menu' : 'Publish menu'}</Button>{row.menu && <Button type="button" variant="secondary" disabled={busy} onClick={() => void unpublish()}>Unpublish</Button>}</div> : <p className="text-sm text-ink/60">The meal has ended or its date has passed. This menu is read-only.</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </Card>
}

export function MenuPublishing() {
  const [date, setDate] = useState(today)
  const [data, setData] = useState<DayMenu | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async (day: string) => {
    setLoading(true); setError('')
    try { setData(await http<DayMenu>(`/api/admin/menu?date=${encodeURIComponent(day)}`)) }
    catch (reason) { setData(null); setError(reason instanceof Error ? reason.message : 'Could not load menus.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load(date) }, [date, load])
  return <div className="space-y-6">
    <div><h1 className="font-serif text-3xl font-bold text-ink">Publish meal menus</h1><p className="mt-2 text-ink/70">Set the dishes students will see for a specific date and meal.</p></div>
    <label className="block text-sm font-medium">Menu date<input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value) }} className="mt-1 block h-11 rounded-xl border border-line bg-white px-3" /></label>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {loading ? <p aria-busy="true">Loading menus…</p> : data && <div className="grid gap-4 lg:grid-cols-3">{data.meals.map(row => <MenuEditor key={`${date}_${row.mealType}`} date={date} row={row} onChanged={() => load(date)} />)}</div>}
    <p className="text-sm text-ink/60">Publishing a menu does not book a meal or change its price, timings, or closure status.</p>
  </div>
}
