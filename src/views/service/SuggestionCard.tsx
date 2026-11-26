import { useState } from 'react'
import { Lightbulb, LoaderCircle, Route } from 'lucide-react'
import type { PlanResponse } from '../../../shared/plan'
import type { Task } from '../../../shared/types'
import { Badge } from '../../components/Badge'
import { ApiMessageError, planTrips } from '../../lib/api'
import { suggestion } from '../../lib/suggest'
import { minutesBetween } from '../../lib/time'

export function SuggestionCard({ open, now }: { open: Task[]; now: number }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const byId = new Map(open.map((t) => [t.id, t]))

  async function runPlan() {
    setBusy(true)
    setError(null)
    try {
      const res = await planTrips(
        open.map((t) => ({
          id: t.id,
          table: t.table,
          text: t.text,
          category: t.category,
          priority: t.priority,
          flags: t.flags,
          waitMin: minutesBetween(t.createdAt, now),
        })),
      )
      setPlan(res)
    } catch (e) {
      setError(e instanceof ApiMessageError ? e.message : 'Could not plan trips. Try again.')
    } finally {
      setBusy(false)
    }
  }

  // Only show trips whose tasks are still open.
  const trips = (plan?.trips ?? [])
    .map((trip) => ({ ...trip, tasks: trip.taskIds.map((id) => byId.get(id)).filter((t): t is Task => !!t) }))
    .filter((trip) => trip.tasks.length > 0)

  return (
    <section className="card suggest" aria-labelledby="suggest-title">
      <div className="card-head">
        <h2 id="suggest-title">Next move</h2>
      </div>
      <p className="tip" aria-live="polite">
        <Lightbulb size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>{suggestion(open, now)}</span>
      </p>

      <button className="btn btn-ghost btn-block" onClick={runPlan} disabled={busy || open.length === 0}>
        {busy ? (
          <LoaderCircle size={18} strokeWidth={1.5} className="spin" aria-hidden="true" />
        ) : (
          <Route size={18} strokeWidth={1.5} aria-hidden="true" />
        )}
        {busy ? 'Planning…' : 'Plan my next trips'}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}

      {plan && (
        <div className="trips">
          <div className="trips-head">
            <Badge tone={plan.source === 'ai' ? 'ok' : 'warn'}>{plan.source === 'ai' ? 'AI plan' : 'Rule-based plan'}</Badge>
            <button className="link-btn" onClick={() => setPlan(null)}>Clear</button>
          </div>
          {plan.notice && <p className="muted small">{plan.notice}</p>}
          {trips.length === 0 ? (
            <p className="muted">Every planned task is done.</p>
          ) : (
            <ol className="trip-list">
              {trips.map((trip, i) => (
                <li key={i} className="trip">
                  <div className="trip-title">
                    <span className="mono muted">Trip {i + 1}</span> {trip.title}
                  </div>
                  {trip.reason && <p className="muted small">{trip.reason}</p>}
                  <ul>
                    {trip.tasks.map((t) => (
                      <li key={t.id}>
                        <span className="mono">T{t.table}</span> {t.text}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  )
}
