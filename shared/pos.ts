// "Copy for POS": one clean line the server can paste or read into the POS,
// which stays the system of record. Example:
//   T4: 3 waters, 1 Coke no ice, peanut allergy - check satay sauce, confirm with kitchen
import type { Flag } from './types.js'

export interface PosItem {
  table: number | null
  text: string
  flags: readonly Flag[]
}

const LEADING_VERB_RE = /^(?:bring|get|grab|order|refill|add)\s+/i

function itemPhrase(item: PosItem): string {
  let s = item.text.trim().replace(LEADING_VERB_RE, '').replace(/,\s*/g, ' ').replace(/\s+/g, ' ')
  if (!s) return ''
  // Keep proper nouns (Coke) but lower-case a sentence-style first letter.
  if (/^[A-Z][a-z]/.test(s) && !/^(Coke|Sprite|Pepsi)/.test(s)) s = s[0].toLowerCase() + s.slice(1)
  if (item.flags.includes('allergy') && !/confirm with kitchen/i.test(s)) {
    s = `${/allerg/i.test(s) ? '' : 'allergy - '}${s}, confirm with kitchen`
  }
  if (item.flags.includes('86d') && !/86/.test(s)) s = `${s} (86'd)`
  return s
}

/** One line per table, tables joined with " | ". Items without a table are listed as "T?". */
export function posLine(items: readonly PosItem[]): string {
  const byTable = new Map<string, string[]>()
  for (const item of items) {
    const phrase = itemPhrase(item)
    if (!phrase) continue
    const key = item.table === null ? '?' : String(item.table)
    byTable.set(key, [...(byTable.get(key) ?? []), phrase])
  }
  return [...byTable.entries()]
    .sort(([a], [b]) => (a === '?' ? 1 : b === '?' ? -1 : Number(a) - Number(b)))
    .map(([t, phrases]) => `T${t}: ${phrases.join(', ')}`)
    .join(' | ')
}
