import { useState } from 'react'
import { KeyRound, LoaderCircle, ScrollText } from 'lucide-react'
import { computeStats, type ShiftStats } from '../../../shared/stats'
import type { SummaryResponse } from '../../../shared/summary'
import type { SafeguardKind } from '../../../shared/types'
import { Badge } from '../../components/Badge'
import { HBarChart } from '../../components/HBarChart'
import { ApiMessageError, summarizeShift } from '../../lib/api'
import { formatClock, formatWait, useNow } from '../../lib/time'
import type { useShift } from '../../state/useShift'

const KIND: Record<SafeguardKind, { label: string; tone: 'warn' | 'danger' }> = {
  allergy: { label: 'Allergy', tone: 'danger' },
  '86d': { label: "86'd", tone: 'warn' },
  complaint: { label: 'Complaint', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'danger' },
  clarification: { label: 'Question', tone: 'warn' },
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="card kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value mono">{value}</span>
      {detail && <span className="muted small">{detail}</span>}
    </div>
  )
}

function SummaryCard({ stats, aiConfigured }: { stats: ShiftStats; aiConfigured: boolean | null }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Known before clicking (from /api/health) or learned from the last response.
  const needsKey = summary ? summary.reason === 'not_configured' : aiConfigured === false

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setSummary(await summarizeShift(stats))
    } catch (e) {
      setError(e instanceof ApiMessageError ? e.message : 'Could not write the summary. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card summary" aria-labelledby="summary-title">
      <div className="card-head">
        <h2 id="summary-title">Shift summary</h2>
        {summary && (
          <Badge tone={summary.source === 'ai' ? 'ok' : 'warn'}>{summary.source === 'ai' ? 'AI written' : 'Stats-based'}</Badge>
        )}
      </div>
      {needsKey ? (
        <div className="callout callout-warn needs-key">
          <div className="callout-head">
            <KeyRound size={18} strokeWidth={1.5} aria-hidden="true" />
            <strong>AI summary needs an API key</strong>
          </div>
          <p className="small">
            No AI provider is set up on this server yet, so the summary below is written in code from the numbers on this
            page. Every number in it is real.
          </p>
        </div>
      ) : (
        <p className="muted small">Uses the numbers on this page only. No guest details or task text are sent.</p>
      )}
      <button className="btn btn-primary btn-block" onClick={run} disabled={busy}>
        {busy ? (
          <LoaderCircle size={18} strokeWidth={1.5} className="spin" aria-hidden="true" />
        ) : (
          <ScrollText size={18} strokeWidth={1.5} aria-hidden="true" />
        )}
        {busy
          ? 'Writing summary…'
          : needsKey
            ? summary ? 'Refresh stats summary' : 'Write stats-based summary'
            : summary ? 'Rewrite summary' : 'Write shift summary'}
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      {summary && (
        <div className="summary-body" aria-live="polite">
          {summary.notice && summary.reason !== 'not_configured' && <p className="notice notice-warn small">{summary.notice}</p>}
          <p className="summary-headline">{summary.headline}</p>
          <ul className="summary-insights">
            {summary.insights.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
          <p className="summary-action">
            <span className="field-label">Next step</span>
            {summary.action}
          </p>
        </div>
      )}
    </section>
  )
}

export function StatsView({ shiftApi, aiConfigured }: { shiftApi: ReturnType<typeof useShift>; aiConfigured: boolean | null }) {
  const { shift, settings } = shiftApi
  const now = useNow(30_000)
  const stats = computeStats(shift, now, settings.assignedTables)
  const log = [...shift.log].sort((a, b) => b.at - a.at)

  return (
    <div className="stats">
      <div className="kpi-row">
        <Kpi label="Requests this shift" value={String(stats.requests)} detail={`${stats.open} open`} />
        <Kpi label="Completed" value={String(stats.completed)} detail={`${stats.completionRate}% of requests`} />
        <Kpi
          label="Avg time to complete"
          value={stats.avgCompleteMin === null ? '–' : formatWait(stats.avgCompleteMin).replace('Just now', '<1 min')}
        />
        <Kpi
          label="Longest open wait"
          value={stats.longestOpenWaitMin === null ? '–' : formatWait(stats.longestOpenWaitMin).replace('Just now', '<1 min')}
          detail={stats.longestOpenTable === null ? 'Nothing open' : `Table ${stats.longestOpenTable}`}
        />
        <Kpi label="Safeguard flags" value={String(stats.safeguardsTotal)} detail="Allergy, 86'd, complaints, rejected, questions" />
      </div>

      <div className="stats-grid">
        <section className="card" aria-labelledby="by-table-title">
          <div className="card-head">
            <h2 id="by-table-title">Requests by table</h2>
          </div>
          <HBarChart
            title="Requests by table"
            unit="requests"
            series={[
              { key: 'completed', label: 'Completed', colorVar: '--viz-1' },
              { key: 'open', label: 'Open', colorVar: '--viz-2' },
            ]}
            rows={stats.byTable.map((r) => ({ label: `Table ${r.table}`, values: { completed: r.completed, open: r.open } }))}
          />
        </section>

        <section className="card" aria-labelledby="by-type-title">
          <div className="card-head">
            <h2 id="by-type-title">Requests by type</h2>
          </div>
          {stats.byCategory.length ? (
            <HBarChart
              title="Requests by type"
              unit="requests"
              series={[{ key: 'count', label: 'Requests', colorVar: '--viz-2' }]}
              rows={stats.byCategory.map((c) => ({ label: c.category[0].toUpperCase() + c.category.slice(1), values: { count: c.count } }))}
            />
          ) : (
            <p className="muted">No requests yet.</p>
          )}
        </section>

        <section className="card" aria-labelledby="log-title">
          <div className="card-head">
            <h2 id="log-title">Safeguard log</h2>
            <span className="muted small mono">{log.length}</span>
          </div>
          {log.length ? (
            <ol className="log">
              {log.map((e) => (
                <li key={e.id} className="log-row">
                  <span className="mono muted small log-time">{formatClock(e.at)}</span>
                  <Badge tone={KIND[e.kind].tone}>{KIND[e.kind].label}</Badge>
                  <span className="log-text">
                    {e.table !== null && <span className="mono">T{e.table} </span>}
                    {e.text}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No safeguards triggered yet.</p>
          )}
        </section>

        <SummaryCard stats={stats} aiConfigured={aiConfigured} />
      </div>
    </div>
  )
}
