import { useRef } from 'react'
import { Ban, CircleHelp, Pencil, TriangleAlert, X } from 'lucide-react'
import { posLine } from '../../../shared/pos'
import { Badge, FlagBadge, Pill, categoryLabel } from '../../components/Badge'
import { CopyButton } from '../../components/CopyButton'
import { chooseMismatch, readiness, removeRow, resolveConflict, setRowTable, setRowText, type VerifyRow, type VerifyState } from '../../lib/verify'

interface Props {
  state: VerifyState
  tables: number[]
  /** Functional update, so quick successive taps never work on stale state. */
  onChange: (update: (state: VerifyState) => VerifyState) => void
  onConfirm: () => void
  onDiscard: () => void
  onEditNote: () => void
}

function TableMessage({ row, onPick }: { row: VerifyRow; onPick: (t: number) => void }) {
  if (row.tableStatus === 'ok') return null
  if (row.tableStatus === 'conflict') {
    return (
      <div className="table-ask" role="group" aria-label={row.tableMessage}>
        <p className="table-ask-text">
          <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" /> {row.tableMessage}
        </p>
        <div className="table-ask-options">
          {row.tableOptions.map((t) => (
            <button key={t} type="button" className="btn btn-ghost" onClick={() => onPick(t)}>
              Table {t}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <p className={`table-warn ${row.tableStatus === 'outside' ? 'text-danger' : 'text-warn'}`}>
      <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" /> {row.tableMessage}
    </p>
  )
}

/** Human-in-the-loop: nothing reaches the table cards until the server confirms it here. */
export function VerificationCard({ state, tables, onChange, onConfirm, onDiscard, onEditNote }: Props) {
  const inputs = useRef<Record<string, HTMLInputElement | null>>({})
  const rows = state.rows
  const n = rows.filter((r) => r.text.trim()).length
  const { ready, blockers } = readiness(state, tables)
  const pos = posLine(rows.filter((r) => r.text.trim()))

  const whatChanged = [
    ...state.tableCorrections.map((c) => `Table ${c.from} -> ${c.to} (you corrected yourself)`),
    ...rows.flatMap((r) => r.changes.map((c) => `${r.table !== null ? `T${r.table}: ` : ''}${c}`)),
    ...state.changes,
  ]
  const title =
    state.kind === 'visit'
      ? `Visit · ${state.startTable !== null ? `Table ${state.startTable}` : 'table not set'}`
      : 'Typed note'

  return (
    <section className="card review" aria-labelledby="review-title">
      <div className="card-head">
        <div>
          <h2 id="review-title">Check before adding</h2>
          <p className="muted small">{title}</p>
        </div>
        <Badge tone={state.source === 'ai' ? 'ok' : 'warn'}>{state.source === 'ai' ? 'AI parsed' : 'Fallback mode'}</Badge>
      </div>

      {state.notice && <p className="notice notice-warn">{state.notice}</p>}
      {state.trimmed && (
        <p className="notice notice-warn">This visit was long, so only the most recent part was analyzed. Earlier requests may be missing.</p>
      )}

      {rows.length > 0 ? (
        <ul className="draft-list" aria-label="Final tasks">
          {rows.map((r) => (
            <li key={r.key} className={`draft ${r.tableStatus !== 'ok' ? 'draft-attn' : ''}`}>
              <div className="draft-main">
                <label className="sr-only" htmlFor={`table-${r.key}`}>Table</label>
                <select
                  id={`table-${r.key}`}
                  className="select mono"
                  value={r.table ?? ''}
                  aria-invalid={r.tableStatus !== 'ok' || undefined}
                  onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; onChange((s) => setRowTable(s, r.key, v, tables)) }}
                >
                  {r.table === null && <option value="">T?</option>}
                  {tables.map((t) => (
                    <option key={t} value={t}>T{t}</option>
                  ))}
                </select>
                <label className="sr-only" htmlFor={`text-${r.key}`}>Task</label>
                <input
                  id={`text-${r.key}`}
                  ref={(el) => {
                    inputs.current[r.key] = el
                  }}
                  className="input"
                  value={r.text}
                  maxLength={60}
                  onChange={(e) => { const v = e.target.value; onChange((s) => setRowText(s, r.key, v)) }}
                />
                <button className="btn-icon" onClick={() => inputs.current[r.key]?.focus()} aria-label={`Edit task: ${r.text}`}>
                  <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button className="btn-icon" onClick={() => onChange((s) => removeRow(s, r.key))} aria-label={`Remove task: ${r.text}`}>
                  <X size={18} strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
              <TableMessage row={r} onPick={(t) => onChange((s) => resolveConflict(s, r.key, t, tables))} />
              <div className="draft-meta">
                <Pill>{categoryLabel(r.category)}</Pill>
                {r.priority === 'high' && <Badge tone="neutral">High</Badge>}
                {r.flags.map((f) => <FlagBadge key={f} flag={f} />)}
                {r.note && <span className={`task-note ${r.flags.includes('allergy') ? 'text-danger' : ''}`}>{r.note}</span>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No tasks to add from this {state.kind === 'visit' ? 'visit' : 'note'}.</p>
      )}

      {whatChanged.length > 0 && (
        <div className="changes">
          <h3 className="field-label">What changed</h3>
          <ul>
            {whatChanged.map((c, i) => (
              <li key={i} className="small">{c}</li>
            ))}
          </ul>
        </div>
      )}

      {state.mismatches.length > 0 && (
        <div className="callout callout-warn">
          <div className="callout-head">
            <CircleHelp size={18} strokeWidth={1.5} aria-hidden="true" />
            <strong>Guest and read-back differ</strong>
          </div>
          {state.mismatches.map((m) => (
            <div key={m.key} className="mismatch" role="group" aria-label="Choose which version is right">
              {(['guest', 'readBack'] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  className="btn btn-ghost mismatch-option"
                  aria-pressed={m.choice === which}
                  onClick={() => onChange((s) => chooseMismatch(s, m.key, which))}
                >
                  <span className="muted small">{which === 'guest' ? 'Guest said' : 'You read back'}</span>
                  <span>{which === 'guest' ? m.guest : m.readBack}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {state.clarifications.length > 0 && (
        <div className="callout callout-warn">
          <div className="callout-head">
            <CircleHelp size={18} strokeWidth={1.5} aria-hidden="true" />
            <strong>Needs a table or detail</strong>
          </div>
          <ul>
            {state.clarifications.map((c, i) => <li key={i}>{c.question}</li>)}
          </ul>
          {state.kind === 'note' && (
            <button className="btn btn-ghost btn-sm" onClick={onEditNote}>
              <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Edit note
            </button>
          )}
        </div>
      )}

      {state.rejected.length > 0 && (
        <div className="callout callout-danger">
          <div className="callout-head">
            <Ban size={18} strokeWidth={1.5} aria-hidden="true" />
            <strong>Not added</strong>
            <Badge tone="danger">Rejected</Badge>
          </div>
          <ul>
            {state.rejected.map((x, i) => (
              <li key={i} className="rejected-item">
                {x.request && <span className="rejected-request mono">{x.request}</span>}
                <span className="rejected-reason">{x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.skipped.length > 0 && (
        <p className="muted small">
          <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" /> Skipped, already open: {state.skipped.join('; ')}
        </p>
      )}

      {n > 0 && !ready && (
        <ul className="blockers small" aria-live="polite">
          {blockers.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}

      <div className="review-actions">
        {/* No "Confirm 0 tasks": when nothing can be added, only Dismiss is offered. */}
        {n > 0 && (
          <button className="btn btn-primary" onClick={onConfirm} disabled={!ready}>
            {n === 1 ? 'Confirm 1 task' : `Confirm ${n} tasks`}
          </button>
        )}
        {n > 0 && <CopyButton text={pos} />}
        <button className="btn btn-ghost" onClick={onDiscard}>
          {n > 0 ? 'Discard' : 'Dismiss'}
        </button>
      </div>
    </section>
  )
}
