import { describe, expect, it } from 'vitest'
import { chooseTable, resolveTable, spokenTables, trimTranscript } from './tables'

const SECTION = [1, 4, 7]

describe('spokenTables: table numbers said anywhere in a visit', () => {
  it('reads digits, words, "T7" and "table number four"', () => {
    expect(spokenTables('okay so for table one they want ranch').spoken).toEqual([1])
    expect(spokenTables('T7 wants the check').spoken).toEqual([7])
    expect(spokenTables('table number four needs water').spoken).toEqual([4])
    expect(spokenTables('table 1 needs water and table 7 wants the check').spoken).toEqual([1, 7])
  })

  it('does not read quantities or party sizes as tables', () => {
    expect(spokenTables('two waters and a table for two').spoken).toEqual([])
    expect(spokenTables('can I get 3 lemonades').spoken).toEqual([])
  })

  it('applies a self-correction and reports the original', () => {
    const r = spokenTables('table 1, sorry, 7 is ready for the check')
    expect(r.spoken).toEqual([7])
    expect(r.corrections).toEqual([{ from: 1, to: 7 }])
    expect(r.correctedText).toBe('table 7 is ready for the check')
    expect(spokenTables('table 4 I mean table 7 wants ranch').corrections).toEqual([{ from: 4, to: 7 }])
    expect(spokenTables('table 4 no, table 1 needs water').spoken).toEqual([1])
  })

  it('does not mistake "no ice" or "sorry, two waters" for a correction', () => {
    expect(spokenTables('table 4, no ice on the Coke').corrections).toEqual([])
    expect(spokenTables('table 4, sorry, two waters for them too').corrections).toEqual([])
    expect(spokenTables('table 4, no, two waters').corrections).toEqual([])
  })
})

describe('trimTranscript', () => {
  it('keeps short transcripts as they are (whitespace tidied)', () => {
    expect(trimTranscript('  two   waters ')).toEqual({ text: 'two waters', trimmed: false })
  })

  it('keeps the most recent part at a word boundary when too long', () => {
    const r = trimTranscript('alpha '.repeat(2000) + 'final request', 8000)
    expect(r.trimmed).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(8000)
    expect(r.text.endsWith('final request')).toBe(true)
    expect(r.text.startsWith('alpha')).toBe(true)
  })
})

describe('resolveTable: the table rules', () => {
  const none = { spoken: [] as number[], corrections: [] as { from: number; to: number }[], section: SECTION }

  it('card tapped, no number spoken -> the card table', () => {
    expect(resolveTable({ ...none, cardTable: 4, aiTable: null })).toMatchObject({ table: 4, tableSource: 'card', tableStatus: 'ok' })
    // A table the model made up (never said) is ignored.
    expect(resolveTable({ ...none, cardTable: 4, aiTable: 7 })).toMatchObject({ table: 4, tableStatus: 'ok' })
  })

  it('number spoken -> that table', () => {
    expect(resolveTable({ ...none, spoken: [1], cardTable: null, aiTable: 1 })).toMatchObject({ table: 1, tableSource: 'spoken', tableStatus: 'ok' })
    expect(resolveTable({ ...none, spoken: [4], cardTable: 4, aiTable: 4 })).toMatchObject({ table: 4, tableStatus: 'ok' })
  })

  it('card and spoken number differ -> ask with both as buttons', () => {
    const d = resolveTable({ ...none, spoken: [1], cardTable: 4, aiTable: 1 })
    expect(d).toMatchObject({ table: null, tableStatus: 'conflict', tableOptions: [4, 1] })
    expect(d.tableMessage).toBe('You started on Table 4 but said table 1. Which one?')
    // Same when the model kept the card table although only table 1 was said.
    expect(resolveTable({ ...none, spoken: [1], cardTable: 4, aiTable: 4 })).toMatchObject({ tableStatus: 'conflict', tableOptions: [4, 1] })
  })

  it('no table at all -> missing, picker empty', () => {
    expect(resolveTable({ ...none, cardTable: null, aiTable: null })).toMatchObject({ table: null, tableStatus: 'missing', tableSource: 'none' })
    expect(resolveTable({ ...none, cardTable: null, aiTable: 4 })).toMatchObject({ table: null, tableStatus: 'missing' })
  })

  it('table outside the section -> warning, no table set', () => {
    const d = resolveTable({ ...none, spoken: [9], cardTable: null, aiTable: 9 })
    expect(d).toMatchObject({ table: null, tableStatus: 'outside', heardTable: 9 })
    expect(d.tableMessage).toMatch(/Table 9 is not in your section \(1, 4, 7\)/)
  })

  it('self-correction: the original number is replaced by the correction', () => {
    const d = resolveTable({ ...none, spoken: [7], corrections: [{ from: 1, to: 7 }], cardTable: null, aiTable: 1 })
    expect(d).toMatchObject({ table: 7, tableSource: 'corrected', tableStatus: 'ok' })
  })
})

describe('chooseTable: the server picks', () => {
  const conflict = { table: null, tableStatus: 'conflict' as const, tableOptions: [4, 1], heardTable: 1, tableMessage: 'x' }
  it('a section table resolves the task', () => {
    expect(chooseTable(conflict, 1, SECTION)).toMatchObject({ table: 1, tableStatus: 'ok', tableOptions: [] })
  })
  it('a table outside the section is refused with a warning', () => {
    expect(chooseTable(conflict, 9, SECTION)).toMatchObject({ table: null, tableStatus: 'outside' })
  })
  it('clearing the picker makes it missing again', () => {
    expect(chooseTable({ ...conflict, table: 4, tableStatus: 'ok' as const }, null, SECTION)).toMatchObject({ tableStatus: 'missing' })
  })
})
