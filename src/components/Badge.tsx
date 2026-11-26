import type { ReactNode } from 'react'
import type { Flag } from '../../shared/types'

type Tone = 'ok' | 'warn' | 'danger' | 'neutral'

/** Uppercase status badge: AI ONLINE, FALLBACK MODE, WAITING, ALLERGY, 86'D, REJECTED. */
export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  )
}

const FLAG_LABEL: Record<Flag, { label: string; tone: Tone }> = {
  allergy: { label: 'Allergy', tone: 'danger' },
  '86d': { label: "86'd", tone: 'warn' },
  complaint: { label: 'Complaint', tone: 'danger' },
}

export function FlagBadge({ flag }: { flag: Flag }) {
  const f = FLAG_LABEL[flag]
  return <Badge tone={f.tone}>{f.label}</Badge>
}

/** "drinks" -> "Drinks". Title Case for category pills and chart labels. */
export function categoryLabel(category: string): string {
  return category.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Neutral category pill, so it never competes with status badges. */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>
}

export function AiStatusBadge({ mode }: { mode: 'ai' | 'fallback' | 'checking' }) {
  if (mode === 'checking') return <Badge tone="neutral">Checking AI</Badge>
  return mode === 'ai' ? (
    <Badge tone="ok" title="Notes are organized by Claude">AI online</Badge>
  ) : (
    <Badge tone="warn" title="AI is unavailable. Notes are organized by the keyword parser.">Fallback mode</Badge>
  )
}
