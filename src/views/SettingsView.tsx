import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { MAX_SECTION_SIZE, TABLE_MAX, TABLE_MIN } from '../../shared/restaurant'
import { ConfirmModal } from '../components/Modal'
import type { useShift } from '../state/useShift'

export function SettingsView({ shiftApi }: { shiftApi: ReturnType<typeof useShift> }) {
  const { settings, setAssignedTables, resetShift } = shiftApi
  const [confirming, setConfirming] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const selected = settings.assignedTables
  const all = Array.from({ length: TABLE_MAX - TABLE_MIN + 1 }, (_, i) => i + TABLE_MIN)

  function toggle(t: number) {
    if (selected.includes(t)) {
      if (selected.length > 1) setAssignedTables(selected.filter((x) => x !== t))
    } else if (selected.length < MAX_SECTION_SIZE) {
      setAssignedTables([...selected, t])
    }
  }

  return (
    <div className="stack">
      <section className="card" aria-labelledby="section-title">
        <div className="card-head">
          <h2 id="section-title">Your section</h2>
          <span className="mono muted">{selected.join(', ')}</span>
        </div>
        <p className="muted">
          Pick the tables you're serving tonight (up to {MAX_SECTION_SIZE}). TableTap rejects requests for any other table.
        </p>
        <div className="table-picker" role="group" aria-label="Tables in your section">
          {all.map((t) => {
            const on = selected.includes(t)
            const disabled = (!on && selected.length >= MAX_SECTION_SIZE) || (on && selected.length === 1)
            return (
              <button
                key={t}
                className="table-toggle mono"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => toggle(t)}
                aria-label={`Table ${t}`}
              >
                {t}
              </button>
            )
          })}
        </div>
      </section>

      <section className="card" aria-labelledby="reset-title">
        <div className="card-head">
          <h2 id="reset-title">Reset shift</h2>
        </div>
        <p className="muted">
          Clears every task and log entry in this browser and loads the sample shift again. Your section stays the same.
        </p>
        <button className="btn btn-danger-ghost" onClick={() => setConfirming(true)}>
          <RotateCcw size={18} strokeWidth={1.5} aria-hidden="true" /> Reset shift
        </button>
        {resetDone && <p className="muted small" role="status">Shift reset. Sample tasks loaded.</p>}
      </section>

      <section className="card" aria-labelledby="data-title">
        <div className="card-head">
          <h2 id="data-title">About this demo</h2>
        </div>
        <p className="muted">
          Juniper &amp; Pine is a made-up restaurant. Every task is synthetic, with no guest names, payment data or personal
          details. Your shift is saved only in this browser, so each tester gets their own copy.
        </p>
      </section>

      {confirming && (
        <ConfirmModal
          title="Reset shift?"
          confirmLabel="Reset shift"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            resetShift()
            setConfirming(false)
            setResetDone(true)
          }}
        >
          <p>This deletes every task you've added or completed in this browser. It can't be undone.</p>
        </ConfirmModal>
      )}
    </div>
  )
}
