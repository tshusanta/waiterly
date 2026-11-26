import { useState } from 'react'
import { Ban, CircleHelp, Pencil, Send, TriangleAlert, X } from 'lucide-react'
import { posLine } from '../../../shared/pos'
import { RESTAURANT } from '../../../shared/restaurant'
import { Badge, FlagBadge, Pill, categoryLabel } from '../../components/Badge'
import { CopyButton } from '../../components/CopyButton'
import {
  chooseMismatch,
  dismissQuestion,
  itemState,
  removeRow,
  replaceUnavailable,
  resolveConflict,
  setRowTable,
  setRowText,
  splitRows,
  type VerifyRow,
  type VerifyState,
} from '../../lib/verify'

type Fix = (update: (state: VerifyState) => VerifyState) => void

interface Props {
  state: VerifyState
  tables: number[]
  /** Functional update. Any held item the update makes ready is sent right away. */
  onFix: Fix
  onSendReady: () => void
  onDiscard: () => void
  onEditNote: () => void
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)
const AVAILABLE = RESTAURANT.menu.filter((m) => !RESTAURANT.soldOut.some((s) => m.includes(s)))

/** Task text that wraps (never cut off); the pencil turns it into a text box. */
function TaskText({ row, onFix }: { row: VerifyRow; onFix: Fix }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="draft-body">
      {editing ? (
        <>
          <label className="sr-only" htmlFor={`text-${row.key}`}>Task</label>
          <textarea
            id={`text-${row.key}`}
            className="input draft-edit"
            rows={2}
            autoFocus
            maxLength={60}
            value={row.text}
            onChange={(e) => { const v = e.target.value; onFix((s) => setRowText(s, row.key, v)) }}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); setEditing(false) } }}
          />
        </>
      ) : (
        <p className="draft-text">{row.text}</p>
      )}
      <button type="button" className="btn-icon" onClick={() => setEditing((v) => !v)} aria-label={`Edit task: ${row.text}`}>
        <Pencil size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <button type="button" className="btn-icon" onClick={() => onFix((s) => removeRow(s, row.key))} aria-label={`Remove task: ${row.text}`}>
        <X size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  )
}

function Meta({ row }: { row: VerifyRow }) {
  return (
    <div className="draft-meta">
      <Pill>{categoryLabel(row.category)}</Pill>
      {row.priority === 'high' && <Badge tone="neutral">High</Badge>}
      {row.flags.map((f) => <FlagBadge key={f} flag={f} />)}
      {row.note && <span className={`task-note ${row.flags.includes('allergy') ? 'text-danger' : ''}`}>{row.note}</span>}
    </div>
  )
}

function ReadyRow({ row, tables, onFix }: { row: VerifyRow; tables: number[]; onFix: Fix }) {
  return (
    <li className="draft">
      <div className="draft-main">
        <label className="sr-only" htmlFor={`table-${row.key}`}>Table</label>
        <select
          id={`table-${row.key}`}
          className="select mono"
          value={row.table ?? ''}
          onChange={(e) => { const v = e.target.value ? Number(e.target.value) : null; onFix((s) => setRowTable(s, row.key, v, tables)) }}
        >
          {tables.map((t) => <option key={t} value={t}>T{t}</option>)}
        </select>
        <TaskText row={row} onFix={onFix} />
      </div>
      <Meta row={row} />
    </li>
  )
}

function TableButtons({ row, tables, onFix }: { row: VerifyRow; tables: number[]; onFix: Fix }) {
  const suggested = row.tableStatus === 'conflict' ? row.tableOptions : []
  return (
    <div className="held-fix">
      <p className="held-why">
        <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" /> {row.tableMessage || 'Which table is this for?'}
      </p>
      <div className="table-buttons" role="group" aria-label={`Send "${row.text}" to a table`}>
        {[...suggested.filter((t) => tables.includes(t)), ...tables.filter((t) => !suggested.includes(t))].map((t) => (
          <button
            key={t}
            type="button"
            className={`btn table-btn mono ${suggested.includes(t) ? 'table-btn-suggested' : ''}`}
            onClick={() => onFix((s) => resolveConflict(s, row.key, t, tables))}
            aria-label={`Send to Table ${t}`}
          >
            T{t}
          </button>
        ))}
      </div>
    </div>
  )
}

function UnavailableFix({ row, onFix }: { row: VerifyRow; onFix: Fix }) {
  const [replacing, setReplacing] = useState(false)
  const [sub, setSub] = useState('')
  const u = row.unavailable!
  const item = u.item[0].toUpperCase() + u.item.slice(1)
  const listId = `menu-${row.key}`
  return (
    <div className="held-fix">
      <p className="held-why text-warn">
        <TriangleAlert size={16} strokeWidth={1.5} aria-hidden="true" />
        {u.reason === 'sold_out' ? `${item} is sold out - tell the guest` : `${item} isn't on the menu - tell the guest`}
      </p>
      {replacing ? (
        <form
          className="replace-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (sub.trim()) onFix((s) => replaceUnavailable(s, row.key, sub))
          }}
        >
          <label className="sr-only" htmlFor={`sub-${row.key}`}>Substitute</label>
          <input
            id={`sub-${row.key}`}
            className="input"
            list={listId}
            autoFocus
            placeholder="Type or pick the substitute"
            value={sub}
            maxLength={40}
            onChange={(e) => setSub(e.target.value)}
          />
          <datalist id={listId}>
            {AVAILABLE.map((m) => <option key={m} value={m} />)}
          </datalist>
          <button type="submit" className="btn btn-primary" disabled={!sub.trim()}>
            <Send size={16} strokeWidth={1.5} aria-hidden="true" /> Send
          </button>
        </form>
      ) : (
        <div className="held-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setReplacing(true)}>Replace</button>
          <button type="button" className="btn btn-ghost" onClick={() => onFix((s) => removeRow(s, row.key))}>Remove</button>
        </div>
      )}
    </div>
  )
}

function MismatchFix({ state, row, onFix }: { state: VerifyState; row: VerifyRow; onFix: Fix }) {
  const m = state.mismatches.find((x) => x.rowKey === row.key && x.choice === null)
  if (!m) return null
  return (
    <div className="held-fix">
      <p className="held-why">
        <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" /> Guest and read-back differ. Tap the right one.
      </p>
      <div className="mismatch" role="group" aria-label="Choose which version is right">
        {(['guest', 'readBack'] as const).map((which) => (
          <button key={which} type="button" className="btn btn-ghost mismatch-option" onClick={() => onFix((s) => chooseMismatch(s, m.key, which))}>
            <span className="muted small">{which === 'guest' ? 'Guest said' : 'You read back'}</span>
            <span>{which === 'guest' ? m.guest : m.readBack}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function HeldRow({ state, row, tables, onFix }: { state: VerifyState; row: VerifyRow; tables: number[]; onFix: Fix }) {
  const kind = itemState(state, row, tables)
  return (
    <li className={`draft draft-held held-${kind}`}>
      <div className="draft-main">
        <span className={`table-tag mono ${row.table === null ? 'table-tag-empty' : ''}`}>{row.table === null ? 'T?' : `T${row.table}`}</span>
        <TaskText row={row} onFix={onFix} />
      </div>
      {kind === 'held-mismatch' && <MismatchFix state={state} row={row} onFix={onFix} />}
      {kind === 'held-unavailable' && <UnavailableFix row={row} onFix={onFix} />}
      {kind === 'held-table' && <TableButtons row={row} tables={tables} onFix={onFix} />}
      <Meta row={row} />
    </li>
  )
}

/** Human-in-the-loop: ready items go out on one tap; each held item goes out the moment it's fixed. */
export function VerificationCard({ state, tables, onFix, onSendReady, onDiscard, onEditNote }: Props) {
  const { ready, held } = splitRows(state, tables)
  const needs = held.length + state.questions.length
  const unsent = state.rows.length

  const whatChanged = [
    ...state.tableCorrections.map((c) => `Table ${c.from} → ${c.to} (you corrected yourself)`),
    ...[...state.sent, ...state.rows].flatMap((r) => r.changes.map((c) => `${r.table !== null ? `T${r.table}: ` : ''}${c}`)),
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
          <p className="muted small">
            {title}
            {state.sent.length > 0 && ` · ${state.sent.length} sent`}
          </p>
        </div>
        <Badge tone={state.source === 'ai' ? 'ok' : 'warn'}>{state.source === 'ai' ? 'AI parsed' : 'Fallback mode'}</Badge>
      </div>

      {state.notice && <p className="notice notice-warn">{state.notice}</p>}
      {state.trimmed && (
        <p className="notice notice-warn">This visit was long, so only the most recent part was analyzed. Earlier requests may be missing.</p>
      )}
      {state.sent.length > 0 && needs > 0 && (
        <p className="held-count" aria-live="polite">
          {needs} {plural(needs, 'item needs', 'items need')} you
        </p>
      )}

      {ready.length > 0 && (
        <div className="verify-group">
          <h3 className="group-title">Ready to send ({ready.length})</h3>
          <ul className="draft-list" aria-label="Ready to send">
            {ready.map((r) => <ReadyRow key={r.key} row={r} tables={tables} onFix={onFix} />)}
          </ul>
          <button type="button" className="btn btn-primary btn-block send-ready" onClick={onSendReady}>
            <Send size={16} strokeWidth={1.5} aria-hidden="true" /> Send ready items ({ready.length})
          </button>
        </div>
      )}

      {needs > 0 && (
        <div className="verify-group">
          <h3 className="group-title group-title-warn">Needs you ({needs})</h3>
          <ul className="draft-list" aria-label="Needs you">
            {held.map((r) => <HeldRow key={r.key} state={state} row={r} tables={tables} onFix={onFix} />)}
            {state.questions.map((q, i) => (
              <li key={`q${i}`} className="draft draft-held">
                <div className="draft-main">
                  <p className="held-why draft-text">
                    <CircleHelp size={16} strokeWidth={1.5} aria-hidden="true" /> {q.question}
                  </p>
                  <button type="button" className="btn-icon" onClick={() => onFix((s) => dismissQuestion(s, i))} aria-label={`Dismiss question: ${q.question}`}>
                    <X size={18} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
                {state.kind === 'note' && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={onEditNote}>
                    <Pencil size={16} strokeWidth={1.5} aria-hidden="true" /> Edit note
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unsent === 0 && needs === 0 && state.sent.length === 0 && (
        <p className="muted">No tasks to add from this {state.kind === 'visit' ? 'visit' : 'note'}.</p>
      )}

      {whatChanged.length > 0 && (
        <div className="changes">
          <h3 className="field-label">What changed</h3>
          <ul>
            {whatChanged.map((c, i) => <li key={i} className="small">{c}</li>)}
          </ul>
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
                {x.request && <span className="rejected-request">{x.request}</span>}
                <span className="rejected-reason">{x.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.alreadyOpen.length > 0 && (
        <ul className="already-open small" aria-label="Already on the list">
          {state.alreadyOpen.map((a, i) => (
            <li key={i}>
              Already on Table {a.table}'s list: <span className="already-text">{a.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="review-actions">
        {state.sent.length > 0 && <CopyButton text={posLine(state.sent)} />}
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>
          {unsent > 0 ? 'Discard' : 'Dismiss'}
        </button>
      </div>
    </section>
  )
}
