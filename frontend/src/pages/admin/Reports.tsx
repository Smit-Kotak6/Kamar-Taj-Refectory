import { useEffect, useState } from 'react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

type Counts = { booked: number; redeemed: number; cancelled: number }
type Report = {
  month: string
  totals: Counts
  meals: Array<Counts & { mealType: string }>
  days: Array<Counts & { date: string }>
}
const currentMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date())

export function Reports() {
  const [month, setMonth] = useState(currentMonth)
  const [refresh, setRefresh] = useState(0)
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    http<Report>(`/api/admin/reports?month=${encodeURIComponent(month)}`)
      .then(data => { if (active) { setReport(data); setError('') } })
      .catch(err => { if (active) { setReport(null); setError(err instanceof Error ? err.message : 'Could not load report.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [month, refresh])

  function downloadCsv() {
    if (!report) return
    const rows = [['Date', 'Booked', 'Redeemed', 'Cancelled'],
      ...report.days.map(day => [day.date, String(day.booked), String(day.redeemed), String(day.cancelled)])]
    const csv = rows.map(row => row.join(',')).join('\r\n') + '\r\n'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `kamar-taj-bookings-${report.month}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="space-y-6">
    <div><h1 className="font-serif text-3xl font-bold text-ink">Monthly reports</h1><p className="mt-2 text-ink/70">Recorded booking and QR redemption counts from the database.</p></div>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium text-ink">Month<input type="month" value={month} onChange={event => { if (event.target.value) { setLoading(true); setMonth(event.target.value) } }} className="mt-1 block h-11 rounded-xl border border-line bg-white px-3" /></label>
      <Button variant="secondary" onClick={() => { setLoading(true); setRefresh(value => value + 1) }}>Refresh</Button>
      {report && <Button variant="secondary" onClick={downloadCsv}>Download CSV</Button>}
    </div>
    {error && <Card><p role="alert" className="text-danger">{error}</p></Card>}
    {loading ? <p aria-busy="true">Loading report…</p> : report && <>
      <div className="grid gap-4 sm:grid-cols-3">
        {(['booked', 'redeemed', 'cancelled'] as const).map(key => <Card key={key}><p className="text-sm capitalize text-ink/65">{key}</p><p className="mt-2 font-serif text-3xl font-semibold text-ink">{report.totals[key]}</p></Card>)}
      </div>
      <Card as="section"><h2 className="mb-4 font-serif text-xl font-semibold">By meal</h2><div className="grid gap-4 sm:grid-cols-3">{report.meals.map(meal => <div key={meal.mealType} className="rounded-xl border border-line p-4"><h3 className="font-semibold capitalize">{meal.mealType}</h3><p className="mt-2 text-sm">Booked: {meal.booked} · Redeemed: {meal.redeemed} · Cancelled: {meal.cancelled}</p></div>)}</div></Card>
      <Card as="section"><h2 className="mb-4 font-serif text-xl font-semibold">Daily activity</h2><div className="overflow-x-auto"><table className="w-full min-w-[440px] text-left text-sm"><thead><tr className="border-b border-line"><th className="py-3">Date</th><th>Booked</th><th>Redeemed</th><th>Cancelled</th></tr></thead><tbody>{report.days.map(day => <tr key={day.date} className="border-b border-line last:border-0"><td className="py-3">{day.date}</td><td>{day.booked}</td><td>{day.redeemed}</td><td>{day.cancelled}</td></tr>)}</tbody></table></div></Card>
      <p className="text-sm text-ink/60">Booked includes redeemed meals. Counts include recorded bookings only; students without generated bookings are not counted. These are meal activity records, not billing or measured waste figures.</p>
    </>}
  </div>
}
