import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, X } from 'lucide-react'
import { cleanTaskText } from '../../../shared/parse/text'
import { posLine } from '../../../shared/pos'
import { quickTapTask } from '../../../shared/quickTap'
import type { Clarification, Rejection } from '../../../shared/parse/types'
import type { SafeguardEvent, Task } from '../../../shared/types'
import { CopyButton } from '../../components/CopyButton'
import { ConfirmModal } from '../../components/Modal'
import { UndoToast } from '../../components/UndoToast'
import { ApiMessageError, parseNote, parseVisit } from '../../lib/api'
import { getSpeechRecognition } from '../../lib/speech'
import { useNow } from '../../lib/time'
import { fromParseResponse, fromVisitResponse, isFinished, takeFixed, takeReady, type VerifyRow, type VerifyState } from '../../lib/verify'
import { MIC_NOTICE_TEXT, startVisitRecorder, type VisitEndReason, type VisitRecorder } from '../../lib/visitRecorder'
import { makeId } from '../../state/id'
import { doneTasks, openTasks } from '../../state/shift'
import type { useShift } from '../../state/useShift'
import { CaptureCard } from './CaptureCard'
import { SuggestionCard } from './SuggestionCard'
import { TableBoard } from './TableBoard'
import { VerificationCard } from './VerificationCard'
import { AnalyzingBar, ListeningBar, TypedVisitCard } from './VisitBar'

type ShiftApi = ReturnType<typeof useShift>

interface Props {
  shiftApi: ShiftApi
  onParsed: (source: 'ai' | 'fallback') => void
  prefill: { note: string; id: number } | null
}

const MIC_NOTICE_KEY = 'waiterly.micNotice.v1'

function micNoticeSeen(): boolean {
  try {
    return localStorage.getItem(MIC_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

interface Visit {
  table: number | null
  startedAt: number
  finalText: string
  interim: string
  phase: 'listening' | 'analyzing'
}

const NOT_SUPPORTED = "Voice input isn't supported in this browser (for example on some iPhones). Type the visit instead."
const END_NOTES: Partial<Record<VisitEndReason, string>> = {
  cap: 'The visit reached the 10-minute limit, so listening stopped there.',
}

export function ServiceView({ shiftApi, onParsed, prefill }: Props) {
  const { shift, settings, addTasks, completeTask, undoTask, removeTask, addLogEvents } = shiftApi
  const now = useNow()
  const [note, setNote] = useState(prefill?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verify, setVerifyState] = useState<VerifyState | null>(null)
  // The latest card state, read synchronously so quick successive taps never send twice.
  const verifyLive = useRef<VerifyState | null>(null)
  const setVerify = useCallback((s: VerifyState | null) => {
    verifyLive.current = s
    setVerifyState(s)
  }, [])
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [sentBar, setSentBar] = useState<{ count: number; tables: number[]; pos: string } | null>(null)
  const [visit, setVisit] = useState<Visit | null>(null)
  const [typedVisit, setTypedVisit] = useState<{ table: number | null; reason: string } | null>(null)
  const [visitMsg, setVisitMsg] = useState<string | null>(null)
  const [pendingNotice, setPendingNotice] = useState<{ table: number | null } | null>(null)
  const [toast, setToast] = useState<{ message: string; taskId: string; key: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const verifyRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<VisitRecorder | null>(null)
  const mounted = useRef(true)

  const open = openTasks(shift)
  const done = doneTasks(shift)
  const tables = settings.assignedTables
  // The recorder calls back later; read the latest section and open tasks from refs.
  const latest = useRef({ open, tables })
  latest.current = { open, tables }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      recorderRef.current?.stop()
    }
  }, [])

  // Bring a new verification card into view (it may be far above the table the server is at).
  useEffect(() => {
    if (verify?.kind === 'visit') verifyRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [verify?.kind, verify?.rows.length])

  const logQuestions = useCallback(
    (rejected: Rejection[], clarifications: Clarification[], card?: VerifyState) => {
      const at = Date.now()
      addLogEvents([
        // A sold-out request is logged when it's heard, whether it's later replaced or removed.
        ...(card?.rows ?? [])
          .filter((r) => r.unavailable?.reason === 'sold_out')
          .map((r): SafeguardEvent => ({ id: makeId(), at, kind: '86d', table: r.table, text: r.text })),
        ...rejected.map((r): SafeguardEvent => ({ id: makeId(), at, kind: 'rejected', table: null, text: `${r.request ? `${r.request}: ` : ''}${r.reason}` })),
        ...clarifications.map((c): SafeguardEvent => ({ id: makeId(), at, kind: 'clarification', table: null, text: c.question })),
      ])
    },
    [addLogEvents],
  )

  async function organize() {
    const trimmed = note.trim()
    if (!trimmed) {
      setError('Type a note first.')
      textareaRef.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await parseNote(trimmed, tables, open.map((t) => ({ table: t.table, text: t.text })))
      onParsed(res.source)
      const card = fromParseResponse(res, makeId)
      setSentBar(null)
      setVerify(card)
      logQuestions(res.rejected, res.needs_clarification, card)
    } catch (e) {
      setError(e instanceof ApiMessageError ? e.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function analyzeVisit(table: number | null, transcript: string, endNote?: string) {
    setTypedVisit(null)
    setVisit((v) => ({ table, startedAt: v?.startedAt ?? Date.now(), finalText: transcript, interim: '', phase: 'analyzing' }))
    try {
      const { open: o, tables: t } = latest.current
      const res = await parseVisit(transcript, table, t, o.map((x) => ({ table: x.table, text: x.text })))
      if (!mounted.current) return
      onParsed(res.source)
      const card = fromVisitResponse(res, table, makeId)
      setSentBar(null)
      setVerify(card)
      logQuestions(res.rejected, res.needs_clarification, card)
      setVisitMsg(endNote ?? null)
    } catch (e) {
      if (!mounted.current) return
      setVisitMsg(e instanceof ApiMessageError ? e.message : 'Something went wrong organizing the visit. Try again.')
    } finally {
      if (mounted.current) setVisit(null)
    }
  }

  function onVisitEnd(table: number | null, reason: VisitEndReason, transcript: string, err?: string) {
    recorderRef.current = null
    if (!mounted.current) return
    if (!transcript.trim()) {
      setVisit(null)
      if (reason === 'error' && err && /blocked|turned off|No microphone|language/i.test(err)) {
        setTypedVisit({ table, reason: err })
      } else {
        setVisitMsg(
          reason === 'silence'
            ? 'No speech for 20 seconds, so the visit ended. Nothing was added.'
            : err ?? "Didn't hear anything, so nothing was added. Try again or tap a quick button.",
        )
      }
      return
    }
    void analyzeVisit(table, transcript, err ?? END_NOTES[reason])
  }

  function beginListening(table: number | null) {
    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      setTypedVisit({ table, reason: NOT_SUPPORTED })
      return
    }
    setVisitMsg(null)
    setVisit({ table, startedAt: Date.now(), finalText: '', interim: '', phase: 'listening' })
    recorderRef.current = startVisitRecorder({
      Recognition,
      onUpdate: (finalText, interim) => setVisit((v) => (v && v.phase === 'listening' ? { ...v, finalText, interim } : v)),
      onEnd: (reason, transcript, err) => onVisitEnd(table, reason, transcript, err),
    })
  }

  function startVisit(table: number | null) {
    if (visit || typedVisit) return
    if (verify && verify.rows.length > 0) {
      setVisitMsg('Send or discard the items waiting in "Check before adding" first.')
      verifyRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      return
    }
    if (!getSpeechRecognition()) {
      setTypedVisit({ table, reason: NOT_SUPPORTED })
      return
    }
    if (!micNoticeSeen()) {
      setPendingNotice({ table })
      return
    }
    beginListening(table)
  }

  /** Put these rows on their table cards. Only rows with a section table get here. */
  function sendRows(rows: VerifyRow[], card: VerifyState) {
    const at = Date.now()
    const tasks: Task[] = rows
      .map((r) => ({ ...r, text: cleanTaskText(r.text, 10) }))
      .filter((r): r is typeof r & { table: number } => !!r.text && r.table !== null && tables.includes(r.table))
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
        source: card.source,
      }))
    if (!tasks.length) return
    addTasks(tasks)
    addLogEvents(
      tasks.flatMap((t) => t.flags.filter((f) => f !== '86d').map((f): SafeguardEvent => ({ id: makeId(), at, kind: f, table: t.table, text: t.text }))),
    )
    if (card.kind === 'note') setNote('')
    setVisitMsg(null)
  }

  /** After a send or a fix: close the card when nothing is left, with "Copy for POS" for what was sent. */
  function settle(next: VerifyState) {
    if (!isFinished(next)) {
      setVerify(next)
      return
    }
    setVerify(null)
    if (next.sent.length) {
      setSentBar({
        count: next.sent.length,
        tables: [...new Set(next.sent.map((r) => r.table!))].sort((a, b) => a - b),
        pos: posLine(next.sent),
      })
    }
  }

  function sendReady() {
    const cur = verifyLive.current
    if (!cur) return
    const { state, sent } = takeReady(cur, tables)
    sendRows(sent, cur)
    settle(state)
  }

  function fixCard(update: (s: VerifyState) => VerifyState) {
    const cur = verifyLive.current
    if (!cur) return
    const { state, sent } = takeFixed(cur, update(cur), tables)
    if (sent.length) sendRows(sent, cur)
    // A text edit keeps the card even if it empties nothing; removals and sends may close it.
    if (state.rows.length === cur.rows.length && state.questions.length === cur.questions.length) setVerify(state)
    else settle(state)
  }

  function discard() {
    if (verifyLive.current && verifyLive.current.rows.length > 0) setConfirmDiscard(true)
    else setVerify(null)
  }

  function quickTap(table: number, tapId: string) {
    const task = quickTapTask(tapId, table, Date.now(), makeId())
    addTasks([task])
    setToast({ message: `Added "${task.text}" to Table ${table}`, taskId: task.id, key: Date.now() })
  }

  const closeToast = useCallback(() => setToast(null), [])
  const cancelNotice = useCallback(() => setPendingNotice(null), [])
  const cancelDiscard = useCallback(() => setConfirmDiscard(false), [])
  const visitBusy = visit !== null || typedVisit !== null

  const verifyCard = verify && (
    <div ref={verifyRef} className="scroll-target">
      <VerificationCard
        state={verify}
        tables={tables}
        onFix={fixCard}
        onSendReady={sendReady}
        onDiscard={discard}
        onEditNote={() => {
          setVerify(null)
          textareaRef.current?.focus()
        }}
      />
    </div>
  )

  return (
    <div className={`service ${visit ? 'service-visit' : ''}`}>
      <div className="service-left">
        {typedVisit && (
          <TypedVisitCard
            table={typedVisit.table}
            reason={typedVisit.reason}
            onSubmit={(text) => void analyzeVisit(typedVisit.table, text)}
            onCancel={() => setTypedVisit(null)}
          />
        )}
        {visitMsg && (
          <p className="notice notice-warn" role="alert">
            {visitMsg}
          </p>
        )}
        {sentBar && (
          <div className="notice notice-ok sent-bar" role="status">
            <span>
              Sent {sentBar.count} {sentBar.count === 1 ? 'item' : 'items'} to {sentBar.tables.map((t) => `Table ${t}`).join(', ')}.
            </span>
            <CopyButton text={sentBar.pos} className="btn btn-ghost btn-sm" />
            <button type="button" className="btn-icon" onClick={() => setSentBar(null)} aria-label="Dismiss">
              <X size={18} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>
        )}
        {verify?.kind === 'visit' && verifyCard}
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
        {verify?.kind === 'note' && verifyCard}
        <SuggestionCard open={open} now={now} />
      </div>
      <TableBoard
        open={open}
        done={done}
        tables={tables}
        now={now}
        onComplete={completeTask}
        onUndo={undoTask}
        onQuickTap={quickTap}
        onStartVisit={startVisit}
        visitBusy={visitBusy}
      />

      {visit?.phase === 'listening' && (
        <ListeningBar
          table={visit.table}
          startedAt={visit.startedAt}
          finalText={visit.finalText}
          interim={visit.interim}
          onStop={() => recorderRef.current?.stop()}
        />
      )}
      {visit?.phase === 'analyzing' && <AnalyzingBar table={visit.table} />}
      {!visitBusy && (
        <button className="visit-fab" onClick={() => startVisit(null)} aria-label="Start a table visit (say the table number)">
          <Mic size={22} strokeWidth={1.5} aria-hidden="true" />
          <span>Start visit</span>
        </button>
      )}
      {toast && (
        <UndoToast
          key={toast.key}
          message={toast.message}
          onDone={closeToast}
          onUndo={() => {
            removeTask(toast.taskId)
            setToast(null)
          }}
        />
      )}

      {confirmDiscard && verify && (
        <ConfirmModal
          title="Discard the items that weren't sent?"
          confirmLabel="Discard"
          danger
          onCancel={cancelDiscard}
          onConfirm={() => {
            setConfirmDiscard(false)
            setVerify(null)
          }}
        >
          <p>
            {verify.rows.length} {verify.rows.length === 1 ? 'item still needs' : 'items still need'} you and{' '}
            {verify.rows.length === 1 ? "hasn't" : "haven't"} been sent. Items already sent stay on their tables.
          </p>
        </ConfirmModal>
      )}

      {pendingNotice && (
        <ConfirmModal
          title="Before you start"
          confirmLabel="Start listening"
          onCancel={cancelNotice}
          onConfirm={() => {
            try {
              localStorage.setItem(MIC_NOTICE_KEY, '1')
            } catch {
              /* storage blocked: the notice shows again next time */
            }
            const { table } = pendingNotice
            setPendingNotice(null)
            beginListening(table)
          }}
        >
          <p>{MIC_NOTICE_TEXT}</p>
        </ConfirmModal>
      )}
    </div>
  )
}
