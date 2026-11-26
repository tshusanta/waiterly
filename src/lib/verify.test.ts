import { describe, expect, it } from 'vitest'
import type { VisitResponse, VisitTask } from '../../shared/visit/types'
import { chooseMismatch, fromParseResponse, fromVisitResponse, readiness, removeRow, resolveConflict, setRowTable } from './verify'

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

describe('verification card: nothing is added until every task has a section table', () => {
  it('all tasks ok -> Confirm enabled', () => {
    const s = fromVisitResponse(response([task({})]), 4, key)
    expect(readiness(s, SECTION)).toEqual({ ready: true, blockers: [] })
  })

  it('conflict -> Confirm disabled until a button is picked', () => {
    let s = fromVisitResponse(response([task({ table: null, tableStatus: 'conflict', tableOptions: [4, 1] })]), 4, key)
    expect(readiness(s, SECTION)).toEqual({ ready: false, blockers: ['Choose which table for 1 task.'] })
    s = setRowTable(s, s.rows[0].key, 1, SECTION)
    expect(s.rows[0]).toMatchObject({ table: 1, tableStatus: 'ok' })
    expect(readiness(s, SECTION).ready).toBe(true)
  })

  it('no table -> picker empty, Confirm disabled until one is chosen', () => {
    let s = fromVisitResponse(response([task({ table: null, tableStatus: 'missing', tableSource: 'none' }), task({ table: null, tableStatus: 'missing', text: 'Bring napkins' })]), null, key)
    expect(readiness(s, SECTION)).toEqual({ ready: false, blockers: ['Pick a table for 2 tasks.'] })
    s = setRowTable(s, s.rows[0].key, 7, SECTION)
    s = setRowTable(s, s.rows[1].key, 7, SECTION)
    expect(readiness(s, SECTION).ready).toBe(true)
  })

  it('outside the section -> must pick a section table or remove the task', () => {
    const s = fromVisitResponse(response([task({ table: null, tableStatus: 'outside', heardTable: 9 }), task({ text: 'Bring ranch' })]), null, key)
    expect(readiness(s, SECTION).blockers).toEqual(['1 task is outside your section.'])
    expect(readiness(setRowTable(s, s.rows[0].key, 9, SECTION), SECTION).ready).toBe(false) // 9 is still refused
    expect(readiness(setRowTable(s, s.rows[0].key, 4, SECTION), SECTION).ready).toBe(true)
    expect(readiness(removeRow(s, s.rows[0].key), SECTION).ready).toBe(true)
  })

  it('mismatch -> the server must choose a version, and the task text follows the choice', () => {
    let s = fromVisitResponse(
      response([task({ text: 'Bring side of blue cheese' })], { mismatches: [{ taskIndex: 0, guest: 'side of ranch', readBack: 'side of blue cheese' }] }),
      4,
      key,
    )
    expect(readiness(s, SECTION).blockers).toEqual(['Choose a version for 1 mismatch.'])
    s = chooseMismatch(s, s.mismatches[0].key, 'guest')
    expect(s.rows[0].text).toBe('Side of ranch')
    expect(readiness(s, SECTION).ready).toBe(true)
  })

  it('removing a task also removes its mismatch', () => {
    const s = fromVisitResponse(response([task({})], { mismatches: [{ taskIndex: 0, guest: 'a', readBack: 'b' }] }), 4, key)
    const after = removeRow(s, s.rows[0].key)
    expect(after.mismatches).toEqual([])
    expect(readiness(after, SECTION).ready).toBe(false) // nothing left to add
  })

  it('typed notes use the same card, already resolved by the note validator', () => {
    const s = fromParseResponse(
      { source: 'fallback', tasks: [{ table: 4, text: 'Bring ranch', category: 'condiments', priority: 'normal', flags: [], note: '' }], needs_clarification: [], rejected: [], skipped: [] },
      key,
    )
    expect(s.kind).toBe('note')
    expect(readiness(s, SECTION).ready).toBe(true)
  })

  it('answering the table question once resolves every task with the same question', () => {
    const c = { table: null, tableStatus: 'conflict' as const, tableOptions: [4, 1], heardTable: 1 }
    const s = fromVisitResponse(response([task(c), task({ ...c, text: 'Bring ranch' }), task({ text: 'Bring napkins' })]), 4, key)
    const after = resolveConflict(s, s.rows[0].key, 1, SECTION)
    expect(after.rows.map((r) => r.table)).toEqual([1, 1, 4])
    expect(readiness(after, SECTION).ready).toBe(true)
  })
})
