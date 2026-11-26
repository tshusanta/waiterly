import { describe, expect, it } from 'vitest'
import { posLine } from '../../shared/pos'
import type { ParseResponse } from '../../shared/parse/types'
import type { VisitResponse, VisitTask } from '../../shared/visit/types'
import {
  chooseMismatch,
  dismissQuestion,
  fromParseResponse,
  fromVisitResponse,
  isFinished,
  itemState,
  removeRow,
  replaceUnavailable,
  resolveConflict,
  setRowTable,
  splitRows,
  takeFixed,
  takeReady,
  type VerifyState,
} from './verify'

const SECTION = [1, 4, 7]
let n = 0
const key = () => `k${++n}`

const task = (over: Partial<VisitTask>): VisitTask => ({
  table: 4, text: 'Bring 2 waters', category: 'drinks', priority: 'normal', flags: [], note: '',
  tableSource: 'card', tableStatus: 'ok', tableOptions: [], heardTable: null, tableMessage: '', changes: [], ...over,
})
const response = (tasks: VisitTask[], extra: Partial<VisitResponse> = {}): VisitResponse => ({
  source: 'ai', tasks, changes: [], mismatches: [], tableCorrections: [], needs_clarification: [], rejected: [], skipped: [], trimmed: false, ...extra,
})
const states = (s: VerifyState) => s.rows.map((r) => itemState(s, r, SECTION))
/** What the card does on a tap: apply the fix, send whatever it made ready. */
const fix = (s: VerifyState, update: (s: VerifyState) => VerifyState) => takeFixed(s, update(s), SECTION)

describe('check card: one unclear or unavailable item never blocks the rest', () => {
  it('3 clear items, 1 unclear table, 1 sold-out: send 3 first, then fix the other 2 one by one', () => {
    let s = fromVisitResponse(
      response([
        task({ text: 'Bring 2 waters' }),
        task({ text: 'Bring ranch', category: 'condiments' }),
        task({ text: 'Bring check', category: 'check', priority: 'high' }),
        task({ text: 'Bring napkins', table: null, tableSource: 'none', tableStatus: 'missing', tableMessage: 'No table was said. Pick one before confirming.' }),
        task({ text: "Tell guest salmon is 86'd", flags: ['86d'], category: 'service', unavailable: { item: 'salmon', reason: 'sold_out' } }),
      ]),
      4,
      key,
    )
    expect(states(s)).toEqual(['ready', 'ready', 'ready', 'held-table', 'held-unavailable'])
    expect(splitRows(s, SECTION).ready).toHaveLength(3)

    // "Send ready items (3)": only the 3 ready items go out; the card stays open with 2 held.
    const first = takeReady(s, SECTION)
    expect(first.sent.map((r) => r.text)).toEqual(['Bring 2 waters', 'Bring ranch', 'Bring check'])
    s = first.state
    expect(s.rows).toHaveLength(2)
    expect(isFinished(s)).toBe(false)

    // Tap T7 on the unclear item: it is sent at once.
    const napkins = s.rows.find((r) => r.text === 'Bring napkins')!
    const second = fix(s, (x) => resolveConflict(x, napkins.key, 7, SECTION))
    expect(second.sent).toHaveLength(1)
    expect(second.sent[0]).toMatchObject({ table: 7, text: 'Bring napkins' })
    s = second.state
    expect(s.rows).toHaveLength(1)

    // Replace the salmon with a substitute: sent at once to the card's table, no 86'd flag.
    const third = fix(s, (x) => replaceUnavailable(x, x.rows[0].key, 'ribeye steak'))
    expect(third.sent[0]).toMatchObject({ table: 4, text: 'Bring ribeye steak', category: 'food' })
    expect(third.sent[0].flags).not.toContain('86d')
    expect(third.sent[0].unavailable).toBeUndefined()
    s = third.state
    expect(isFinished(s)).toBe(true)

    // Copy for POS lists only what was sent.
    expect(s.sent).toHaveLength(5)
    expect(posLine(s.sent)).toBe('T4: 2 waters, ranch, check, ribeye steak | T7: napkins')
  })

  it('Copy for POS never includes held items', () => {
    const s = fromVisitResponse(
      response([task({ text: 'Bring 2 waters' }), task({ text: 'Bring napkins', table: null, tableStatus: 'missing', tableSource: 'none' })]),
      null,
      key,
    )
    const after = takeReady(s, SECTION).state
    expect(posLine(after.sent)).toBe('T4: 2 waters')
    expect(after.rows.map((r) => r.text)).toEqual(['Bring napkins'])
  })

  it('a mismatch is fixed by one tap, and that tap sends the item', () => {
    const s = fromVisitResponse(
      response([task({ text: 'Bring side of blue cheese' }), task({ text: 'Bring 2 waters' })], {
        mismatches: [{ taskIndex: 0, guest: 'side of ranch', readBack: 'side of blue cheese' }],
      }),
      4,
      key,
    )
    expect(states(s)).toEqual(['held-mismatch', 'ready'])
    const { state, sent } = fix(s, (x) => chooseMismatch(x, x.mismatches[0].key, 'guest'))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ table: 4, text: 'Side of ranch' })
    // The ready item was not sent by that tap; it waits for "Send ready items".
    expect(state.rows.map((r) => r.text)).toEqual(['Bring 2 waters'])
    expect(state.mismatches).toEqual([])
  })

  it('a mismatch on an item with no table: choosing a version leaves it waiting for a table', () => {
    const s = fromVisitResponse(
      response([task({ text: 'Bring Coke', table: null, tableStatus: 'missing', tableSource: 'none' })], {
        mismatches: [{ taskIndex: 0, guest: 'Coke, no ice', readBack: 'Coke' }],
      }),
      null,
      key,
    )
    const a = fix(s, (x) => chooseMismatch(x, x.mismatches[0].key, 'guest'))
    expect(a.sent).toEqual([])
    expect(states(a.state)).toEqual(['held-table'])
    const b = fix(a.state, (x) => resolveConflict(x, x.rows[0].key, 1, SECTION))
    expect(b.sent[0]).toMatchObject({ table: 1, text: 'Coke, no ice' })
  })

  it('an already-open item is a quiet line, not a row and not a rejection', () => {
    const s = fromVisitResponse(
      response([task({ text: 'Bring napkins' })], {
        skipped: ['Table 4: Bring 2 waters (already open)'],
        alreadyOpen: [{ table: 4, text: 'Bring 2 waters' }],
      }),
      4,
      key,
    )
    expect(s.alreadyOpen).toEqual([{ table: 4, text: 'Bring 2 waters' }])
    expect(s.rows.map((r) => r.text)).toEqual(['Bring napkins'])
    expect(s.rejected).toEqual([])
    // Older responses without alreadyOpen are read from skipped.
    const old = fromVisitResponse(response([], { skipped: ['Table 4: Bring 2 waters (already open)'] }), 4, key)
    expect(old.alreadyOpen).toEqual([{ table: 4, text: 'Bring 2 waters' }])
  })

  it('an item is never both ready and held ("2 waters and napkins" on T7 and also "Which table?")', () => {
    const res: ParseResponse = {
      source: 'ai',
      tasks: [
        { table: 7, text: 'Bring 2 waters', category: 'drinks', priority: 'normal', flags: [], note: '' },
        { table: 7, text: 'Bring napkins', category: 'supplies', priority: 'low', flags: [], note: '' },
      ],
      needs_clarification: [
        { request: '2 waters and napkins', question: 'Which table wants 2 waters and napkins?' },
        { request: 'more bread', question: 'Which table wants more bread?' },
      ],
      rejected: [],
      skipped: [],
    }
    const s = fromParseResponse(res, key)
    expect(s.rows.map((r) => [r.text, itemState(s, r, SECTION)])).toEqual([
      ['Bring 2 waters', 'ready'],
      ['Bring napkins', 'ready'],
      ['More bread', 'held-table'],
    ])
    // Every row is in exactly one of the two lists.
    const { ready, held } = splitRows(s, SECTION)
    expect(ready.length + held.length).toBe(s.rows.length)
    expect(ready.some((r) => held.includes(r))).toBe(false)
  })

  it('a question with no request stays a question until dismissed', () => {
    const s = fromParseResponse({ source: 'ai', tasks: [], needs_clarification: [{ request: '', question: 'Which dressing?' }], rejected: [], skipped: [] }, key)
    expect(s.rows).toEqual([])
    expect(s.questions).toHaveLength(1)
    expect(isFinished(s)).toBe(false)
    expect(isFinished(dismissQuestion(s, 0))).toBe(true)
  })

  it('an allergy in an unclear-table question keeps its allergy flag', () => {
    const s = fromParseResponse(
      { source: 'ai', tasks: [], needs_clarification: [{ request: 'someone has a peanut allergy', question: 'Which table has the allergy?' }], rejected: [], skipped: [] },
      key,
    )
    expect(s.rows[0]).toMatchObject({ flags: ['allergy'], priority: 'high', table: null })
  })

  it('Remove drops an unavailable item without sending anything', () => {
    const s = fromVisitResponse(response([task({ text: "Tell guest salmon is 86'd", flags: ['86d'], unavailable: { item: 'salmon', reason: 'sold_out' } })]), 4, key)
    const { state, sent } = fix(s, (x) => removeRow(x, x.rows[0].key))
    expect(sent).toEqual([])
    expect(isFinished(state)).toBe(true)
    expect(state.sent).toEqual([])
  })

  it('replacing with another sold-out item keeps it held', () => {
    const s = fromVisitResponse(response([task({ text: "Tell guest salmon is 86'd", flags: ['86d'], unavailable: { item: 'salmon', reason: 'sold_out' } })]), 4, key)
    const { state, sent } = fix(s, (x) => replaceUnavailable(x, x.rows[0].key, 'key lime pie'))
    expect(sent).toEqual([])
    expect(states(state)).toEqual(['held-unavailable'])
  })

  it('conflict: one tap answers every item with the same question and sends them', () => {
    const c = { table: null, tableStatus: 'conflict' as const, tableOptions: [4, 1], heardTable: 1 }
    const s = fromVisitResponse(response([task(c), task({ ...c, text: 'Bring ranch' }), task({ text: 'Bring napkins' })]), 4, key)
    expect(states(s)).toEqual(['held-table', 'held-table', 'ready'])
    const { state, sent } = fix(s, (x) => resolveConflict(x, x.rows[0].key, 1, SECTION))
    expect(sent.map((r) => r.table)).toEqual([1, 1])
    expect(state.rows.map((r) => r.text)).toEqual(['Bring napkins'])
  })

  it('a table outside the section is a red rejection, never a row', () => {
    const s = fromVisitResponse(response([task({ table: null, tableStatus: 'outside', heardTable: 9, text: 'Bring high chair' }), task({ text: 'Bring ranch' })]), null, key)
    expect(s.rows.map((r) => r.text)).toEqual(['Bring ranch'])
    expect(s.rejected[0].request).toBe('Table 9: Bring high chair')
  })

  it('moving a ready item to another section table keeps it ready; a non-section table holds it', () => {
    const s = fromVisitResponse(response([task({})]), 4, key)
    expect(states(setRowTable(s, s.rows[0].key, 7, SECTION))).toEqual(['ready'])
    expect(states(setRowTable(s, s.rows[0].key, 9, SECTION))).toEqual(['held-table'])
  })

  it('editing text on a ready item never sends it', () => {
    const s = fromVisitResponse(response([task({})]), 4, key)
    const { sent } = fix(s, (x) => ({ ...x, rows: x.rows.map((r) => ({ ...r, text: 'Bring 3 waters' })) }))
    expect(sent).toEqual([])
  })
})
