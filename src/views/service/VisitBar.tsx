import { useEffect, useRef, useState } from 'react'
import { ListChecks, LoaderCircle, Square, X } from 'lucide-react'
import { TRANSCRIPT_MAX_CHARS } from '../../../shared/visit/types'

const tableLabel = (table: number | null) => (table !== null ? `Table ${table}` : 'table not set')

function useElapsed(startedAt: number): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((now - startedAt) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

interface ListeningProps {
  table: number | null
  startedAt: number
  finalText: string
  interim: string
  onStop: () => void
}

/** Fixed at the bottom (thumb reach): "Listening · Table 4", timer, live transcript, Stop. */
export function ListeningBar({ table, startedAt, finalText, interim, onStop }: ListeningProps) {
  const elapsed = useElapsed(startedAt)
  const textRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    const el = textRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [finalText, interim])

  return (
    <div className="visit-bar" role="region" aria-label="Table visit">
      <div className="visit-bar-head">
        <span className="rec-dot" aria-hidden="true" />
        <strong role="status">Listening · {tableLabel(table)}</strong>
        <span className="mono muted" aria-label={`Elapsed ${elapsed}`}>{elapsed}</span>
        <button className="btn btn-primary visit-stop" onClick={onStop}>
          <Square size={16} strokeWidth={1.5} aria-hidden="true" /> Stop
        </button>
      </div>
      <p className="visit-transcript" ref={textRef}>
        {finalText || interim ? (
          <>
            {finalText} <span className="muted">{interim}</span>
          </>
        ) : (
          <span className="muted">
            {table === null ? 'Say the table number at any point, then the requests.' : 'Go ahead. Read the order back before you stop.'}
          </span>
        )}
      </p>
    </div>
  )
}

export function AnalyzingBar({ table }: { table: number | null }) {
  return (
    <div className="visit-bar" role="status">
      <div className="visit-bar-head">
        <LoaderCircle size={18} strokeWidth={1.5} className="spin" aria-hidden="true" />
        <strong>Organizing visit · {tableLabel(table)}</strong>
      </div>
    </div>
  )
}

interface TypedProps {
  table: number | null
  reason: string
  onSubmit: (text: string) => void
  onCancel: () => void
}

/** Where speech recognition isn't available (or the mic is blocked): type the visit instead. */
export function TypedVisitCard({ table, reason, onSubmit, onCancel }: TypedProps) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  return (
    <section className="card typed-visit" aria-labelledby="typed-visit-title">
      <div className="card-head">
        <h2 id="typed-visit-title">Visit · {tableLabel(table)}</h2>
        <button className="btn-icon" onClick={onCancel} aria-label="Cancel visit">
          <X size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
      <p className="notice notice-warn">{reason}</p>
      <label htmlFor="typed-visit" className="field-label">
        {table === null ? 'What did the table ask for? Include the table number.' : 'What did the table ask for?'}
      </label>
      <textarea
        id="typed-visit"
        ref={ref}
        className="note-input"
        rows={4}
        value={text}
        maxLength={TRANSCRIPT_MAX_CHARS}
        onChange={(e) => setText(e.target.value)}
        placeholder={table === null ? 'table 1, two waters and ranch' : 'two waters, one Coke no ice, ranch'}
      />
      <div className="review-actions">
        <button className="btn btn-primary" disabled={!text.trim()} onClick={() => onSubmit(text)}>
          <ListChecks size={18} strokeWidth={1.5} aria-hidden="true" /> Organize visit
        </button>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  )
}
