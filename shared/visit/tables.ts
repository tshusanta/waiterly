// Table numbers in a spoken visit, and the table rules. These are enforced in
// code on every AI or fallback answer, so the prompt is not the only safeguard.
import { NUMBER_WORDS, wordToNumber } from '../parse/text.js'
import { TRANSCRIPT_MAX_CHARS, type TableCorrection, type TableSource, type TableStatus, type VisitTask } from './types.js'

const NUM = `\\d{1,2}|twenty[\\s-]\\w+|${Object.keys(NUMBER_WORDS).join('|')}`
// "table 4", "tables 4", "tbl 4", "T7", "t 7", "table number four", "#7".
const MENTION_RE = new RegExp(`(?:\\b(?:tables?|tbl|t)(?:\\s+number)?|#)\\s*-?\\s*(${NUM})\\b`, 'gi')
// Right after a mention: "..., sorry, 7" / "I mean table 7" / "no, table 7".
// A bare number after "no"/"actually"/"wait" is too ambiguous ("no, two waters"), so
// those words need "table" before the number. A bare number after "sorry"/"I mean"
// must end the phrase or be followed by a verb, so "sorry, two waters" isn't a table.
const CORRECTION_RE = new RegExp(
  `^[\\s,.;:-]*(?:` +
    `(?:sorry|i mean|correction|my bad|scratch that|i meant)[\\s,.;:-]*(?:(?:it'?s|make (?:it|that))\\s+)?(?:(?:table|t)\\s*(${NUM})\\b|(${NUM})(?=\\s*(?:[,.;!?]|$)|\\s+(?:wants?|needs?|is|asked|please|they|she|he)\\b))` +
    `|(?:no|actually|wait|make that|make it)[\\s,.;:-]+(?:it'?s\\s+)?(?:table|t)\\s*(${NUM})\\b` +
    `)`,
  'i',
)

export interface SpokenTables {
  /** Final spoken tables, in the order first said (corrected-away numbers removed). */
  spoken: number[]
  corrections: TableCorrection[]
  /** The transcript with each "table 1, sorry, 7" rewritten as "table 7" (for the fallback parser). */
  correctedText: string
}

export function spokenTables(transcript: string): SpokenTables {
  const mentions: { table: number; start: number; end: number }[] = []
  for (const m of transcript.matchAll(MENTION_RE)) {
    const n = wordToNumber(m[1])
    if (n !== null) mentions.push({ table: n, start: m.index!, end: m.index! + m[0].length })
  }
  const corrections: TableCorrection[] = []
  const correctedAway = new Set<number>() // indexes into mentions
  const rewrites: { start: number; end: number; to: number }[] = []
  for (const [i, m] of mentions.entries()) {
    const rest = transcript.slice(m.end)
    const c = rest.match(CORRECTION_RE)
    if (!c) continue
    const to = wordToNumber(c[1] ?? c[2] ?? c[3])
    if (to === null || to === m.table) continue
    corrections.push({ from: m.table, to })
    correctedAway.add(i)
    rewrites.push({ start: m.start, end: m.end + c[0].length, to })
  }
  const spoken: number[] = []
  for (const [i, m] of mentions.entries()) {
    if (correctedAway.has(i)) continue
    if (!spoken.includes(m.table)) spoken.push(m.table)
  }
  for (const c of corrections) if (!spoken.includes(c.to)) spoken.push(c.to)

  let correctedText = transcript
  for (const r of [...rewrites].reverse()) {
    correctedText = `${correctedText.slice(0, r.start)}table ${r.to}${correctedText.slice(r.end)}`
  }
  return { spoken, corrections, correctedText }
}

/** Keep the most recent part of a long transcript, cut at a word boundary. */
export function trimTranscript(transcript: string, max = TRANSCRIPT_MAX_CHARS): { text: string; trimmed: boolean } {
  const t = transcript.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return { text: t, trimmed: false }
  const tail = t.slice(-max)
  const firstSpace = tail.indexOf(' ')
  return { text: (firstSpace > -1 && firstSpace < 40 ? tail.slice(firstSpace + 1) : tail).trim(), trimmed: true }
}

export interface TableDecision {
  table: number | null
  tableSource: TableSource
  tableStatus: TableStatus
  tableOptions: number[]
  heardTable: number | null
  tableMessage: string
}

const list = (ns: number[]) => (ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`)

/** The outside-section check, applied after a table is known. */
function checkSection(d: TableDecision, section: number[]): TableDecision {
  if (d.tableStatus !== 'ok' || d.table === null || section.includes(d.table)) return d
  return {
    ...d,
    table: null,
    tableStatus: 'outside',
    heardTable: d.table,
    tableMessage: `Table ${d.table} is not in your section (${section.join(', ')}). Pick a section table or remove this task.`,
  }
}

/**
 * The table rules, in code:
 *  - card tapped, no number spoken  -> the card's table
 *  - number spoken                  -> that table
 *  - card and spoken number differ  -> ask, with both as buttons
 *  - no table at all                -> held: the server taps a section table
 *  - table outside the section      -> warning; pick a section table or remove
 * `aiTable` is what the model (or fallback) assigned. It only counts if that number
 * was actually spoken; a self-corrected number is replaced by its correction.
 */
export function resolveTable(input: {
  cardTable: number | null
  aiTable: number | null
  spoken: number[]
  corrections: TableCorrection[]
  section: number[]
}): TableDecision {
  const { cardTable, spoken, corrections, section } = input
  let t = input.aiTable
  let corrected = false
  const fix = corrections.find((c) => c.from === t)
  if (t !== null && fix && !spoken.includes(t)) {
    t = fix.to
    corrected = true
  }
  if (t !== null && corrections.some((c) => c.to === t)) corrected = true
  const spokenOk = t !== null && spoken.includes(t)
  const spokenSource: TableSource = corrected ? 'corrected' : 'spoken'
  const base = { tableOptions: [] as number[], heardTable: null as number | null, tableMessage: '' }

  if (cardTable !== null) {
    if (spokenOk && t !== cardTable) {
      return {
        table: null, tableSource: spokenSource, tableStatus: 'conflict', tableOptions: [cardTable, t!], heardTable: t,
        tableMessage: `You started on Table ${cardTable} but said table ${t}. Which one?`,
      }
    }
    const others = spoken.filter((s) => s !== cardTable)
    if (!spokenOk && others.length > 0 && !spoken.includes(cardTable)) {
      // The model kept the card's table, but only a different table was said.
      return {
        table: null, tableSource: 'card', tableStatus: 'conflict', tableOptions: [cardTable, ...others.slice(0, 2)], heardTable: others[0],
        tableMessage: `You started on Table ${cardTable} but said table ${list(others.slice(0, 2))}. Which one?`,
      }
    }
    const table = spokenOk ? t! : cardTable
    return checkSection({ ...base, table, tableSource: spokenOk ? spokenSource : 'card', tableStatus: 'ok' }, section)
  }

  if (spokenOk) return checkSection({ ...base, table: t, tableSource: spokenSource, tableStatus: 'ok' }, section)
  return { ...base, table: null, tableSource: 'none', tableStatus: 'missing', tableMessage: 'No table was said. Which table?' }
}

/** The server picked a table (dropdown or conflict button). Section tables only. */
export function chooseTable<T extends Pick<VisitTask, 'table' | 'tableStatus' | 'tableOptions' | 'heardTable' | 'tableMessage'>>(
  task: T,
  table: number | null,
  section: number[],
): T {
  if (table === null) return { ...task, table: null, tableStatus: 'missing', tableOptions: [], tableMessage: 'Which table?' }
  if (!section.includes(table)) {
    return {
      ...task, table: null, tableStatus: 'outside', tableOptions: [], heardTable: table,
      tableMessage: `Table ${table} is not in your section (${section.join(', ')}). Pick a section table or remove this task.`,
    }
  }
  return { ...task, table, tableStatus: 'ok', tableOptions: [], tableMessage: '' }
}
