import { Ban, CircleHelp, Pencil, TriangleAlert, X } from 'lucide-react'
import type { Clarification, DraftTask, Rejection } from '../../../shared/parse/types'
import { Badge, FlagBadge, Pill } from '../../components/Badge'

export interface DraftRow extends DraftTask {
  key: string
}

export interface ReviewState {
  source: 'ai' | 'fallback'
  notice?: string
  rows: DraftRow[]
  clarifications: Clarification[]
  rejected: Rejection[]
  skipped: string[]
}

interface Props {
  review: ReviewState
  tables: number[]
  onChange: (rows: DraftRow[]) => void
  onApprove: () => void
  onDiscard: () => void
  onEditNote: () => void
}

/** Human-in-the-loop: nothing reaches the table cards until the server approves it here. */
export function ReviewCard({ review, tables, onChange, onApprove, onDiscard, onEditNote }: Props) {
  const { rows } = review
  const update = (key: string, patch: Partial<DraftRow>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const n = rows.filter((r) => r.text.trim()).length

  return (
    <section className="card review" aria-labelledby="review-title">
      <div className="card-head">
        <h2 id="review-title">Review before adding</h2>
        <Badge tone={review.source === 'ai' ? 'ok' : 'warn'}>{review.source === 'ai' ? 'AI parsed' : 'Fallback parsed'}</Badge>
      </div>

      {review.notice && <p className="notice notice-warn">{review.notice}</p>}

      {rows.length > 0 ? (
        <ul className="draft-list">
          {rows.map((r) => (
            <li key={r.key} className="draft">
              <div className="draft-main">
                <label className="sr-only" htmlFor={`table-${r.key}`}>Table</label>
                <select
                  id={`table-${r.key}`}
                  className="select mono"
                  value={r.table}
                  onChange={(e) => update(r.key, { table: Number(e.target.value) })}
                >
                  {tables.map((t) => (
                    <option key={t} value={t}>T{t}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`text-${r.key}`}>Task</label>
                <input
                  id={`text-${r.key}`}
                  className="input"
                  value={r.text}
                  maxLength={60}
                  onChange={(e) => update(r.key, { text: e.target.value })}
                />
                <button
                  className="btn-icon"
                  onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                  aria-label={`Remove task: ${r.text}`}
                >
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <div className="draft-meta">
                <Pill>{r.category}</Pill>
                {r.priority === 'high' && <Badge tone="neutral">High</Badge>}
                {r.flags.map((f) => <FlagBadge key={f} flag={f} />)}
                {r.note && (
                  <span className={`task-note ${r.flags.includes('allergy') ? 'text-danger' : ''}`}>{r.note}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No tasks to add from this note.</p>
      )}

      {review.clarifications.length > 0 && (
        <div className="callout callout-warn">
          <div className="callout-head">
            <CircleHelp size={18} strokeWidth={1.5} aria-hidden="true" />
            <strong>Needs a table or detail</strong>
          </div>
          <ul>
            {review.clarifications.map((c, i) => <li key={i}>{c.question}</li>)}
          </ul>
          <button className="btn btn-ghost btn-sm" onClick={onEditNote}>
            <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Edit note
          </button>
        </div>
      )}

      {review.rejected.length > 0 && (
        <div className="callout callout-danger">
          <div className="callout-head">
            <Ban size={18} strokeWidth={1.5} aria-hidden="true" />
            <strong>Not added</strong>
            <Badge tone="danger">Rejected</Badge>
          </div>
          <ul>
            {review.rejected.map((x, i) => (
              <li key={i}>
                {x.request && <span className="mono">{x.request}</span>} <span>{x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.skipped.length > 0 && (
        <p className="muted small">
          <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" /> Skipped, already open: {review.skipped.join('; ')}
        </p>
      )}

      <div className="review-actions">
        <button className="btn btn-primary" onClick={onApprove} disabled={n === 0}>
          {n === 1 ? 'Add 1 task' : `Add ${n} tasks`}
        </button>
        <button className="btn btn-ghost" onClick={onDiscard}>
          {rows.length ? 'Discard' : 'Dismiss'}
        </button>
      </div>
    </section>
  )
}
