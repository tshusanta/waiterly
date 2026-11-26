// Visit analysis without AI: the keyword parser run over the transcript. It
// can't follow a conversation ("iced tea, actually a Coke"), so the endpoint's
// notice tells the server to check every task. Tables still go through the same
// table rules as the AI's answer.
import { FREE_TEXT_NOTE, fallbackParse } from '../parse/fallback.js'
import { spokenTables } from './tables.js'

// fallbackParse only creates tasks for a stated table. With no table said and no
// card, it is given this placeholder, which was never spoken, so the table rules
// turn it into "no table: pick one" (a task with an empty picker, not a guess).
const NO_TABLE = 99

export function fallbackVisit(transcript: string, startTable: number | null) {
  const { spoken, correctedText } = spokenTables(transcript)
  const lead = spoken.length === 0 ? (startTable ?? NO_TABLE) : null
  const parsed = fallbackParse(lead === null ? correctedText : `table ${lead} ${correctedText}`)
  return {
    // A conversation is full of small talk, so the typed-note rule "unknown words with a
    // clear table become a task" would turn "hi folks, welcome" into a task. Not here.
    tasks: parsed.tasks.filter((t) => t.note !== FREE_TEXT_NOTE).map((t) => ({ ...t, table: t.table === NO_TABLE ? null : t.table, changes: [] })),
    changes: [],
    mismatches: [],
    table_corrections: [],
    needs_clarification: parsed.needs_clarification,
    rejected: parsed.rejected,
  }
}
