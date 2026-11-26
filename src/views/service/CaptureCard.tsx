import type { RefObject } from 'react'
import { ListChecks, LoaderCircle } from 'lucide-react'
import { NOTE_MAX_CHARS } from '../../../shared/parse/types'
import { SCENARIOS } from '../../../shared/scenarios'

interface Props {
  note: string
  onNoteChange: (v: string) => void
  onSubmit: () => void
  busy: boolean
  error: string | null
  textareaRef: RefObject<HTMLTextAreaElement | null>
}

export function CaptureCard({ note, onNoteChange, onSubmit, busy, error, textareaRef }: Props) {
  const tooLong = note.length > NOTE_MAX_CHARS
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <section className="card capture" aria-labelledby="capture-title">
      <div className="card-head">
        <h2 id="capture-title">Quick capture</h2>
      </div>

      <label htmlFor="note" className="field-label">
        What do your tables need?
      </label>
      <div className="note-wrap">
        <textarea
          id="note"
          ref={textareaRef}
          className="note-input"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              onSubmit()
            }
          }}
          placeholder="1 needs two waters, 4 wants ranch, 7 ready for the check"
          rows={4}
          aria-describedby="note-help note-count"
          aria-invalid={tooLong || undefined}
        />
      </div>
      <div className="note-meta">
        <span id="note-help" className="muted">
          {`${isMac ? 'Cmd' : 'Ctrl'}+Enter to organize`}
        </span>
        <span id="note-count" className={`mono ${tooLong ? 'text-danger' : 'muted'}`}>
          {note.length}/{NOTE_MAX_CHARS}
        </span>
      </div>

      {(error || tooLong) && (
        <p className="form-error" role="alert">
          {tooLong ? `Note is ${note.length - NOTE_MAX_CHARS} characters too long. Split it into two notes.` : error}
        </p>
      )}

      <button className="btn btn-primary btn-block" onClick={onSubmit} disabled={busy || tooLong}>
        {busy ? (
          <LoaderCircle size={18} strokeWidth={1.5} className="spin" aria-hidden="true" />
        ) : (
          <ListChecks size={18} strokeWidth={1.5} aria-hidden="true" />
        )}
        {busy ? 'Organizing…' : 'Organize with AI'}
      </button>

      <div className="scenarios">
        <span className="field-label" id="scenario-label">
          Test scenarios
        </span>
        <div className="chip-row" role="group" aria-labelledby="scenario-label">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="chip"
              onClick={() => {
                onNoteChange(s.note)
                textareaRef.current?.focus()
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
