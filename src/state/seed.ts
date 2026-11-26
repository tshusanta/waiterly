import type { Category, Flag, Priority, SafeguardEvent, ShiftState, Task } from '../../shared/types'
import { makeId } from './id'

const MIN = 60_000
const ALLERGY_NOTE = 'Confirm with kitchen before serving'

// `slot` picks a table from the current section (0 = first table, 1 = second, and so on),
// so the seed still makes sense if the server changes their section in Settings.
interface SeedTask {
  slot: number
  text: string
  category: Category
  priority: Priority
  flags?: Flag[]
  note?: string
  agoMin: number
  doneAfterMin?: number
}

const OPEN: SeedTask[] = [
  { slot: 0, text: 'Refill 2 waters', category: 'drinks', priority: 'normal', agoMin: 7 },
  { slot: 0, text: 'Bring extra napkins', category: 'supplies', priority: 'low', agoMin: 7 },
  { slot: 1, text: 'Bring ranch on the side', category: 'condiments', priority: 'normal', agoMin: 3 },
  {
    slot: 1,
    text: 'Ask kitchen about sesame in bun',
    category: 'food',
    priority: 'high',
    flags: ['allergy'],
    note: ALLERGY_NOTE,
    agoMin: 2,
  },
  { slot: 2, text: 'Bring check, split 3 ways', category: 'check', priority: 'high', agoMin: 6 },
  { slot: 2, text: 'Bring to-go box for brisket', category: 'supplies', priority: 'normal', agoMin: 1 },
]

const DONE: SeedTask[] = [
  { slot: 0, text: 'Refill iced tea', category: 'drinks', priority: 'normal', agoMin: 85, doneAfterMin: 3 },
  {
    slot: 1,
    text: "Tell guest salmon is 86'd",
    category: 'service',
    priority: 'high',
    flags: ['86d'],
    agoMin: 70,
    doneAfterMin: 2,
  },
  { slot: 2, text: 'Replace dropped fork', category: 'supplies', priority: 'normal', agoMin: 60, doneAfterMin: 4 },
  {
    slot: 2,
    text: 'Manager visit: burger overcooked',
    category: 'service',
    priority: 'high',
    flags: ['complaint'],
    agoMin: 50,
    doneAfterMin: 6,
  },
  { slot: 1, text: 'Wipe up spilled soda', category: 'cleanup', priority: 'normal', agoMin: 40, doneAfterMin: 5 },
  { slot: 0, text: 'Bring hot sauce', category: 'condiments', priority: 'normal', agoMin: 25, doneAfterMin: 2 },
]

export function createSeedShift(now: number, tables: number[]): ShiftState {
  const tableAt = (slot: number) => tables[slot % tables.length]

  const toTask = (s: SeedTask): Task => {
    const createdAt = now - s.agoMin * MIN
    return {
      id: makeId(),
      table: tableAt(s.slot),
      text: s.text,
      category: s.category,
      priority: s.priority,
      flags: s.flags ?? [],
      note: s.note ?? '',
      createdAt,
      doneAt: s.doneAfterMin === undefined ? null : createdAt + s.doneAfterMin * MIN,
      source: 'seed',
    }
  }

  const tasks = [...DONE, ...OPEN].map(toTask)

  const log: SafeguardEvent[] = [
    { id: makeId(), at: now - 70 * MIN, kind: '86d', table: tableAt(1), text: 'Salmon requested, sold out tonight' },
    { id: makeId(), at: now - 55 * MIN, kind: 'rejected', table: 12, text: 'Table 12 is not in your section' },
    { id: makeId(), at: now - 50 * MIN, kind: 'complaint', table: tableAt(2), text: 'Burger overcooked, guest asked for manager' },
    { id: makeId(), at: now - 30 * MIN, kind: 'clarification', table: null, text: 'Which table wants the extra lemons?' },
    { id: makeId(), at: now - 2 * MIN, kind: 'allergy', table: tableAt(1), text: 'Sesame allergy, confirm bun with kitchen' },
  ]

  return { version: 1, startedAt: now - 90 * MIN, tasks, log }
}
