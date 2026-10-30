import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { http } from '../../api/http'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'

type Student = {
  id: string
  name: string
  email: string
  membership: { startDate: string; endDate: string | null } | null
}

function MemberRow({ student, onSaved }: { student: Student; onSaved: () => Promise<void> }) {
  const [start, setStart] = useState(student.membership?.startDate ?? '')
  const [end, setEnd] = useState(student.membership?.endDate ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!start || (end && end < start)) { setMessage('Choose a start date; end must be on or after start.'); return }
    setBusy(true)
    setMessage('')
    try {
      await http(`/api/admin/memberships/${encodeURIComponent(student.id)}`, {
        method: 'PUT', body: { startDate: start, endDate: end || null },
      })
      await onSaved()
      setMessage('Saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save membership.')
    } finally { setBusy(false) }
  }

  return <Card as="form" onSubmit={save} className="space-y-4">
    <div>
      <h2 className="font-semibold text-ink">{student.name}</h2>
      <p className="text-sm text-ink/60">{student.email}</p>
      <p className="mt-1 text-sm">{student.membership ? `${student.membership.startDate} to ${student.membership.endDate ?? 'ongoing'}` : 'No membership yet'}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Start date<input required type="date" value={start} onChange={e => setStart(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label>
      <label className="text-sm">End date (blank = ongoing)<input type="date" min={start || undefined} value={end} onChange={e => setEnd(e.target.value)} className="mt-1 block h-11 w-full rounded-xl border border-line bg-white px-3" /></label>
    </div>
    <div className="flex items-center gap-3"><Button type="submit" loading={busy}>Save membership</Button>{message && <span role="status" className="text-sm">{message}</span>}</div>
  </Card>
}

export function Memberships() {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (search: string) => {
    setLoading(true)
    setError('')
    try { setStudents(await http<Student[]>(`/api/admin/users?search=${encodeURIComponent(search)}`)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load students.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load('') }, [load])

  return <div className="space-y-5">
    <div><h1 className="font-serif text-3xl font-bold text-ink">Student memberships</h1><p className="mt-2 text-ink/70">Set the dates when a student is eligible to book meals. Changes are saved to the database.</p></div>
    <form className="flex max-w-lg gap-2" onSubmit={e => { e.preventDefault(); void load(query) }}>
      <input aria-label="Search students" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3" />
      <Button type="submit">Search</Button>
    </form>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p>Loading students…</p> : !students.length && !error ? <p>No students found.</p> : <div className="grid gap-4 lg:grid-cols-2">{students.map(s => <MemberRow key={s.id} student={s} onSaved={() => load(query)} />)}</div>}
  </div>
}
