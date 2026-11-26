import { useRef, useState } from 'react'
import { cleanTaskText } from '../../../shared/parse/text'
import type { SafeguardEvent, Task } from '../../../shared/types'
import { ApiMessageError, parseNote } from '../../lib/api'
import { useNow } from '../../lib/time'
import { makeId } from '../../state/id'
import { doneTasks, openTasks } from '../../state/shift'
import type { useShift } from '../../state/useShift'
import { CaptureCard } from './CaptureCard'
import { ReviewCard, type ReviewState } from './ReviewCard'
import { SuggestionCard } from './SuggestionCard'
import { TableBoard } from './TableBoard'

type ShiftApi = ReturnType<typeof useShift>

interface Props {
  shiftApi: ShiftApi
  onParsed: (source: 'ai' | 'fallback') => void
  prefill: { note: string; id: number } | null
}

export function ServiceView({ shiftApi, onParsed, prefill }: Props) {
  const { shift, settings, addTasks, completeTask, undoTask, addLogEvents } = shiftApi
  const now = useNow()
  const [note, setNote] = useState(prefill?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const open = openTasks(shift)
  const done = doneTasks(shift)
  const tables = settings.assignedTables

  async function organize() {
    const trimmed = note.trim()
    if (!trimmed) {
      setError('Type or dictate a note first.')
      textareaRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await parseNote(trimmed, tables, open.map((t) => ({ table: t.table, text: t.text })))
      onParsed(res.source)
      setReview({
        source: res.source,
        notice: res.notice,
        rows: res.tasks.map((t) => ({ ...t, key: makeId() })),
        clarifications: res.needs_clarification,
        rejected: res.rejected,
        skipped: res.skipped,
      })
      // Safeguard log: questions and rejections are recorded when they happen.
      const at = Date.now()
      addLogEvents([
        ...res.rejected.map((r): SafeguardEvent => ({ id: makeId(), at, kind: 'rejected', table: null, text: `${r.request ? `${r.request}: ` : ''}${r.reason}` })),
        ...res.needs_clarification.map((c): SafeguardEvent => ({ id: makeId(), at, kind: 'clarification', table: null, text: c.question })),
      ])
    } catch (e) {
      setError(e instanceof ApiMessageError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function approve() {
    if (!review) return
    const at = Date.now()
    const tasks: Task[] = review.rows
      .map((r) => ({ ...r, text: cleanTaskText(r.text) }))
      .filter((r) => r.text && tables.includes(r.table))
      .map((r) => ({
        id: makeId(),
        table: r.table,
        text: r.text,
        category: r.category,
        priority: r.priority,
        flags: r.flags,
        note: r.note,
        createdAt: at,
        doneAt: null,
        source: review.source,
      }))
    addTasks(tasks)
    addLogEvents(
      tasks.flatMap((t) =>
        t.flags.map((f): SafeguardEvent => ({ id: makeId(), at, kind: f, table: t.table, text: t.text })),
      ),
    )
    setReview(null)
    setNote('')
  }

  return (
    <div className="service">
      <div className="service-left">
        <CaptureCard
          note={note}
          onNoteChange={(v) => {
            setNote(v)
            if (error) setError(null)
          }}
          onSubmit={organize}
          busy={busy}
          error={error}
          textareaRef={textareaRef}
        />
        {review && (
          <ReviewCard
            review={review}
            tables={tables}
            onChange={(rows) => setReview({ ...review, rows })}
            onApprove={approve}
            onDiscard={() => setReview(null)}
            onEditNote={() => {
              setReview(null)
              textareaRef.current?.focus()
            }}
          />
        )}
        <SuggestionCard open={open} now={now} />
      </div>
      <TableBoard open={open} done={done} tables={tables} now={now} onComplete={completeTask} onUndo={undoTask} />
    </div>
  )
}
