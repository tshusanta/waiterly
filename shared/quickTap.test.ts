import { describe, expect, it } from 'vitest'
import { posLine } from './pos'
import { QUICK_TAPS, quickTapTask } from './quickTap'

describe('quick-tap requests', () => {
  it('has the six buttons, in order', () => {
    expect(QUICK_TAPS.map((q) => q.label)).toEqual(['Water', 'Check', 'To-go box', 'Napkins', 'Condiment', 'Clear plates'])
  })

  it('makes an open task for the tapped table, with no AI and no review', () => {
    const task = quickTapTask('water', 4, 1_000, 'id-1')
    expect(task).toEqual({
      id: 'id-1', table: 4, text: 'Bring water', category: 'drinks', priority: 'normal',
      flags: [], note: '', createdAt: 1_000, doneAt: null, source: 'quick',
    })
  })

  it('Check is high priority, the rest are normal', () => {
    for (const q of QUICK_TAPS) {
      expect(quickTapTask(q.id, 1, 0, 'x').priority).toBe(q.id === 'check' ? 'high' : 'normal')
    }
    expect(quickTapTask('check', 7, 0, 'x')).toMatchObject({ category: 'check', text: 'Bring check' })
  })

  it('rejects an unknown button id', () => {
    expect(() => quickTapTask('wine', 1, 0, 'x')).toThrow(/Unknown quick tap/)
  })
})

describe('Copy for POS', () => {
  it('writes one clean line per table', () => {
    expect(
      posLine([
        { table: 4, text: 'Bring 3 waters', flags: [] },
        { table: 4, text: 'Bring 1 Coke, no ice', flags: [] },
        { table: 4, text: 'Peanut allergy - check satay sauce', flags: ['allergy'] },
      ]),
    ).toBe('T4: 3 waters, 1 Coke no ice, peanut allergy - check satay sauce, confirm with kitchen')
  })

  it('groups several tables in table order and marks 86\'d items', () => {
    expect(
      posLine([
        { table: 7, text: 'Bring check', flags: [] },
        { table: 1, text: "Tell guest salmon is 86'd", flags: ['86d'] },
        { table: null, text: 'Bring napkins', flags: [] },
      ]),
    ).toBe("T1: tell guest salmon is 86'd | T7: check | T?: napkins")
  })

  it('adds the kitchen line to an allergy task that lacks it', () => {
    expect(posLine([{ table: 4, text: 'Ask kitchen about sesame in bun', flags: ['allergy'] }])).toBe(
      'T4: allergy - ask kitchen about sesame in bun, confirm with kitchen',
    )
  })
})
