// Server-side validation of a visit analysis (AI or fallback). Same idea as the
// note validator: the prompt asks, this code enforces. Tables follow the table
// rules in ./tables.ts, and every task gets the same allergy / 86'd / complaint /
// payment rules as a typed note.
import { CATEGORIES, FLAGS, PRIORITIES, type Category, type Priority } from '../types.js'
import { cleanString, cleanTaskText, isNearDuplicate, mentionedNumbers } from '../parse/text.js'
import { MAX_TASKS, type Clarification, type OpenTaskRef, type Rejection } from '../parse/types.js'
import { PAYMENT_RE, ParseShapeError, dropCovered, enforceRules, notOnMenu, pick, toInt } from '../parse/validate.js'
import { resolveTable, spokenTables } from './tables.js'
import type { Mismatch, TableCorrection, VisitContext, VisitResult, VisitTask } from './types.js'

const MAX_CHANGES_PER_TASK = 4
const MAX_VISIT_CHANGES = 8

function cleanList(value: unknown, max: number, chars = 60): string[] {
  // "Iced tea -> Coke": keep the arrow (cleanString strips < and > as markup).
  const arrow = (v: unknown) => (typeof v === 'string' ? v.replace(/\s*-+>\s*/g, ' → ') : v)
  return Array.isArray(value) ? value.map((v) => cleanString(arrow(v), chars)).filter(Boolean).slice(0, max) : []
}

export function validateVisitResult(raw: unknown, ctx: VisitContext): VisitResult {
  if (!raw || typeof raw !== 'object') throw new ParseShapeError('Output is not an object')
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.tasks)) throw new ParseShapeError('Output has no tasks array')

  const section = ctx.assignedTables
  const { spoken, corrections } = spokenTables(ctx.transcript)
  const decide = (aiTable: number | null) =>
    resolveTable({ cardTable: ctx.startTable, aiTable, spoken, corrections, section })

  const tasks: VisitTask[] = []
  const rawIndexToTask = new Map<number, number>()
  const rejected: Rejection[] = []
  const skipped: string[] = []
  const alreadyOpen: OpenTaskRef[] = []

  for (const [i, item] of r.tasks.slice(0, 40).entries()) {
    if (!item || typeof item !== 'object') continue
    const t = item as Record<string, unknown>
    const text = cleanTaskText(t.text, 10)
    if (!text) continue
    if (PAYMENT_RE.test(text)) {
      rejected.push({ request: text, reason: "Not a guest request. Waiterly can't change payments or comps." })
      continue
    }
    const aiTable = toInt(t.table)
    const category = pick<Category>(CATEGORIES, t.category, 'other')
    const unavailable = notOnMenu(t.unavailable, category)
    const task: VisitTask = {
      ...decide(aiTable === 0 ? null : aiTable),
      ...enforceRules({
        text,
        category,
        ...(unavailable ? { unavailable } : {}),
        priority: pick<Priority>(PRIORITIES, t.priority, 'normal'),
        flags: Array.isArray(t.flags)
          ? FLAGS.filter((f) => (t.flags as unknown[]).some((x) => typeof x === 'string' && x.toLowerCase() === f))
          : [],
        note: cleanString(t.note, 120),
      }),
      changes: cleanList(t.changes, MAX_CHANGES_PER_TASK),
    }
    // A table outside the section is a real rejection (red), not something to fix here.
    if (task.tableStatus === 'outside') {
      rejected.push({ request: `Table ${task.heardTable}: ${task.text}`, reason: `Table ${task.heardTable} is not in your section (${section.join(', ')}).` })
      continue
    }
    // Duplicates: against open tasks (same resolved table), and within this visit.
    if (task.table !== null && ctx.openTasks.some((o) => o.table === task.table && isNearDuplicate(o.text, task.text))) {
      skipped.push(`Table ${task.table}: ${task.text} (already open)`)
      alreadyOpen.push({ table: task.table, text: task.text })
      continue
    }
    const dup = tasks.findIndex((u) => u.table === task.table && u.text.toLowerCase() === task.text.toLowerCase())
    if (dup > -1) {
      rawIndexToTask.set(i, dup)
      continue
    }
    rawIndexToTask.set(i, tasks.length)
    tasks.push(task)
  }

  // Mismatches must point at a real task. One that doesn't becomes its own task
  // (read-back text), so the server still gets the choice.
  const mismatches: Mismatch[] = []
  for (const m of Array.isArray(r.mismatches) ? r.mismatches.slice(0, 6) : []) {
    const x = m as Record<string, unknown>
    const guest = cleanString(x?.guest, 80)
    const readBack = cleanString(x?.read_back ?? x?.readBack, 80)
    if (!guest || !readBack || guest.toLowerCase() === readBack.toLowerCase()) continue
    let taskIndex = rawIndexToTask.get(toInt(x.task_index ?? x.taskIndex) ?? -1)
    if (taskIndex === undefined) {
      if (tasks.length >= MAX_TASKS) continue
      const text = cleanTaskText(readBack, 10)
      if (!text || PAYMENT_RE.test(text)) continue
      const d = decide(null)
      if (d.tableStatus === 'outside') continue
      taskIndex = tasks.length
      tasks.push({ ...d, ...enforceRules({ text, category: 'other' as Category, priority: 'normal' as Priority, flags: [], note: '' }), changes: [] })
    }
    if (!mismatches.some((y) => y.taskIndex === taskIndex)) mismatches.push({ taskIndex, guest, readBack })
  }

  // Corrections: what the code heard is authoritative; the model's are kept only if
  // both numbers were really said.
  const said = mentionedNumbers(ctx.transcript)
  const tableCorrections: TableCorrection[] = [...corrections]
  for (const c of Array.isArray(r.table_corrections) ? r.table_corrections.slice(0, 4) : []) {
    const from = toInt((c as Record<string, unknown>)?.from)
    const to = toInt((c as Record<string, unknown>)?.to)
    if (from !== null && to !== null && from !== to && said.has(from) && said.has(to) &&
      !tableCorrections.some((y) => y.from === from && y.to === to)) tableCorrections.push({ from, to })
  }

  const clarifications: Clarification[] = []
  for (const c of Array.isArray(r.needs_clarification) ? r.needs_clarification.slice(0, 10) : []) {
    const q = cleanString((c as Record<string, unknown>)?.question, 140)
    if (q) clarifications.push({ request: cleanString((c as Record<string, unknown>)?.request, 120), question: q })
  }
  for (const x of Array.isArray(r.rejected) ? r.rejected.slice(0, 10) : []) {
    const reason = cleanString((x as Record<string, unknown>)?.reason, 140)
    if (reason) rejected.push({ request: cleanString((x as Record<string, unknown>)?.request, 120), reason })
  }

  const kept = tasks.slice(0, MAX_TASKS)
  return {
    tasks: kept,
    changes: cleanList(r.changes, MAX_VISIT_CHANGES),
    mismatches: mismatches.filter((m) => m.taskIndex < kept.length),
    tableCorrections,
    // An item is never both a task and a "Which table?" question.
    needs_clarification: dropCovered(clarifications, [...kept, ...alreadyOpen].map((t) => t.text)),
    rejected: rejected.slice(0, 10),
    skipped,
    alreadyOpen,
    trimmed: ctx.trimmed,
  }
}
