import { useState } from 'react'
import { Check, Mic, TriangleAlert, Undo2 } from 'lucide-react'
import { posLine } from '../../../shared/pos'
import { QUICK_TAPS } from '../../../shared/quickTap'
import type { Task } from '../../../shared/types'
import { Badge, FlagBadge, Pill, categoryLabel } from '../../components/Badge'
import { CopyButton } from '../../components/CopyButton'
import { sortTableTasks } from '../../lib/overdue'
import { formatClock, formatDuration, formatWait, minutesBetween, WAITING_THRESHOLD_MIN } from '../../lib/time'

interface Props {
  open: Task[]
  done: Task[]
  tables: number[]
  now: number
  onComplete: (id: string) => void
  onUndo: (id: string) => void
  onQuickTap: (table: number, tapId: string) => void
  onStartVisit: (table: number) => void
  /** A visit is listening or being organized: no second visit can start. */
  visitBusy: boolean
}

function WaitChip({ createdAt, now }: { createdAt: number; now: number }) {
  const min = minutesBetween(createdAt, now)
  if (min >= WAITING_THRESHOLD_MIN) return <Badge tone="warn">Waiting {min} min</Badge>
  return <span className="wait mono">{formatWait(min)}</span>
}

function TaskRow({ task, now, onComplete }: { task: Task; now: number; onComplete: (id: string) => void }) {
  return (
    <li className={`task ${task.priority === 'high' ? 'task-high' : ''}`}>
      <button className="check" onClick={() => onComplete(task.id)} aria-label={`Mark done: ${task.text}`}>
        <span className="check-ring" aria-hidden="true" />
      </button>
      <div className="task-body">
        <div className="task-line">
          <span className="task-text">{task.text}</span>
          <WaitChip createdAt={task.createdAt} now={now} />
        </div>
        <div className="task-meta">
          <Pill>{categoryLabel(task.category)}</Pill>
          {task.priority === 'high' && !task.flags.length && <Badge tone="neutral">High</Badge>}
          {task.flags.map((f) => <FlagBadge key={f} flag={f} />)}
        </div>
        {task.note && (
          <p className={`task-note ${task.flags.includes('allergy') ? 'text-danger' : ''}`}>
            {task.flags.includes('allergy') && <TriangleAlert size={14} strokeWidth={1.5} aria-hidden="true" />}
            {task.note}
          </p>
        )}
        {task.flags.includes('allergy') && <CopyButton text={posLine([task])} className="btn btn-ghost btn-pos" />}
      </div>
    </li>
  )
}

export function TableBoard({ open, done, tables, now, onComplete, onUndo, onQuickTap, onStartVisit, visitBusy }: Props) {
  const [filter, setFilter] = useState<number | 'all'>('all')
  // Section tables, plus any table that still has open tasks (e.g. after a section change).
  const allTables = [...new Set([...tables, ...open.map((t) => t.table)])].sort((a, b) => a - b)
  const shown = filter === 'all' ? allTables : allTables.filter((t) => t === filter)
  const doneShown = done.filter((t) => filter === 'all' || t.table === filter)

  return (
    <section className="board" aria-labelledby="board-title">
      <div className="board-head">
        <h2 id="board-title">Tables</h2>
        <div className="chip-row" role="group" aria-label="Filter by table">
          {(['all', ...allTables] as const).map((t) => (
            <button
              key={t}
              className="chip"
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
            >
              {t === 'all' ? 'All' : `Table ${t}`}
            </button>
          ))}
        </div>
      </div>

      <div className="table-grid">
        {shown.map((table) => {
          // Overdue tasks (open 5+ min) move to the top of their table.
          const tasks = sortTableTasks(open.filter((t) => t.table === table), now)
          const inSection = tables.includes(table)
          return (
            <article key={table} className="card table-card" aria-labelledby={`table-${table}-title`}>
              <header className="table-card-head">
                <h3 id={`table-${table}-title`}>Table {table}</h3>
                <span className="muted small">{tasks.length ? `${tasks.length} open` : 'All clear'}</span>
                {inSection && (
                  <button
                    className="btn-icon card-mic"
                    onClick={() => onStartVisit(table)}
                    disabled={visitBusy}
                    aria-label={`Start visit at Table ${table}`}
                    title={`Start visit at Table ${table}`}
                  >
                    <Mic size={20} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                )}
              </header>
              {inSection && (
                <div className="quick-row" role="group" aria-label={`Quick add for Table ${table}`}>
                  {QUICK_TAPS.map((q) => (
                    <button key={q.id} type="button" className="quick-btn" onClick={() => onQuickTap(table, q.id)}>
                      {q.label}
                    </button>
                  ))}
                </div>
              )}
              {tasks.length ? (
                <ul className="task-list">
                  {tasks.map((t) => <TaskRow key={t.id} task={t} now={now} onComplete={onComplete} />)}
                </ul>
              ) : (
                <p className="muted small empty-table">
                  <Check size={16} strokeWidth={1.5} aria-hidden="true" /> Nothing waiting
                </p>
              )}
            </article>
          )
        })}

      {/* Completed sits in the same grid, so the board fills evenly (e.g. 3 tables + Completed = 2 x 2). */}
      <details className="card done-list">
        <summary>
          Completed <span className="mono muted">({doneShown.length})</span>
        </summary>
        {doneShown.length ? (
          <ul>
            {doneShown.map((t) => (
              <li key={t.id} className="done-row">
                <span className="mono muted">T{t.table}</span>
                <span className="done-text">{t.text}</span>
                <span className="muted small mono">
                  {formatClock(t.doneAt!)} · took {formatDuration(minutesBetween(t.createdAt, t.doneAt!))}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => onUndo(t.id)} aria-label={`Undo: ${t.text}`}>
                  <Undo2 size={16} strokeWidth={1.5} aria-hidden="true" /> Undo
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted small">Nothing completed yet.</p>
        )}
      </details>
      </div>
    </section>
  )
}
