import { describe, expect, it } from 'vitest'
import { CATEGORIES, FLAGS, PRIORITIES } from '../../shared/types'
import { normalizeTables } from '../../shared/restaurant'
import { createSeedShift } from './seed'
import * as S from './shift'

const NOW = Date.UTC(2026, 10, 25, 19, 30) // 7:30 pm dinner rush

function fakeStore(initial: Record<string, string> = {}): S.KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial }
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) }
}

describe('seed shift', () => {
  const shift = createSeedShift(NOW, [1, 4, 7])

  it('has 6 open and 6 completed tasks', () => {
    expect(S.openTasks(shift)).toHaveLength(6)
    expect(S.doneTasks(shift)).toHaveLength(6)
  })

  it('uses only whitelisted values and section tables', () => {
    for (const t of shift.tasks) {
      expect(CATEGORIES).toContain(t.category)
      expect(PRIORITIES).toContain(t.priority)
      t.flags.forEach((f) => expect(FLAGS).toContain(f))
      expect([1, 4, 7]).toContain(t.table)
      expect(t.source).toBe('seed')
    }
  })

  it('has realistic timestamps: in the past, done after created', () => {
    for (const t of shift.tasks) {
      expect(t.createdAt).toBeLessThanOrEqual(NOW)
      expect(t.createdAt).toBeGreaterThanOrEqual(shift.startedAt)
      if (t.doneAt !== null) expect(t.doneAt).toBeGreaterThan(t.createdAt)
    }
  })

  it('includes at least one task waiting over 5 min, so the amber chip shows', () => {
    expect(S.openTasks(shift).some((t) => NOW - t.createdAt > 5 * 60_000)).toBe(true)
  })

  it('flags the allergy task with the kitchen note', () => {
    const allergy = shift.tasks.find((t) => t.flags.includes('allergy'))!
    expect(allergy.priority).toBe('high')
    expect(allergy.note).toBe('Confirm with kitchen before serving')
  })

  it('maps onto a custom section', () => {
    const custom = createSeedShift(NOW, [2, 3])
    expect(new Set(custom.tasks.map((t) => t.table))).toEqual(new Set([2, 3]))
  })
})

describe('persistence', () => {
  it('seeds and saves when storage is empty', () => {
    const store = fakeStore()
    const shift = S.loadShift(store, NOW, [1, 4, 7])
    expect(shift.tasks).toHaveLength(12)
    expect(store.data[S.SHIFT_KEY]).toBeDefined()
  })

  it('recovers from corrupted storage', () => {
    const store = fakeStore({ [S.SHIFT_KEY]: '{not json' })
    expect(S.loadShift(store, NOW, [1, 4, 7]).tasks).toHaveLength(12)
  })

  it('round-trips saved state', () => {
    const store = fakeStore()
    const shift = S.completeTask(S.loadShift(store, NOW, [1, 4, 7]), S.openTasks(S.loadShift(store, NOW, [1, 4, 7]))[0].id, NOW)
    S.saveShift(store, shift)
    expect(S.doneTasks(S.loadShift(store, NOW, [1, 4, 7]))).toHaveLength(7)
  })

  it('works with no storage at all (private mode)', () => {
    expect(S.loadShift(null, NOW, [1, 4, 7]).tasks).toHaveLength(12)
  })

  it('reset replaces the shift with a fresh seed', () => {
    const store = fakeStore()
    let shift = S.loadShift(store, NOW, [1, 4, 7])
    shift = S.addTasks(shift, [{ ...shift.tasks[0], id: 'x', doneAt: null }])
    S.saveShift(store, shift)
    expect(S.resetShift(store, NOW, [1, 4, 7]).tasks).toHaveLength(12)
  })
})

describe('updates and ordering', () => {
  it('complete then undo', () => {
    const shift = createSeedShift(NOW, [1, 4, 7])
    const id = S.openTasks(shift)[0].id
    const done = S.completeTask(shift, id, NOW)
    expect(done.tasks.find((t) => t.id === id)!.doneAt).toBe(NOW)
    expect(S.undoTask(done, id).tasks.find((t) => t.id === id)!.doneAt).toBeNull()
  })

  it('sorts open tasks by priority, then oldest first', () => {
    const open = S.openTasks(createSeedShift(NOW, [1, 4, 7]))
    const rank = { high: 0, normal: 1, low: 2 }
    for (let i = 1; i < open.length; i++) {
      const a = open[i - 1], b = open[i]
      expect(rank[a.priority] < rank[b.priority] || (a.priority === b.priority && a.createdAt <= b.createdAt)).toBe(true)
    }
    expect(open[0].text).toBe('Bring check, split 3 ways') // high and oldest
  })
})

describe('settings', () => {
  it('normalizes table input', () => {
    expect(normalizeTables([7, '4', 1, 1, 99, -2, 2.5])).toEqual([1, 4, 7])
    expect(normalizeTables([])).toEqual([1, 4, 7])
    expect(normalizeTables('garbage')).toEqual([1, 4, 7])
  })

  it('defaults to tables 1, 4, 7', () => {
    expect(S.loadSettings(fakeStore()).assignedTables).toEqual([1, 4, 7])
  })
})

describe('quick-tap undo', () => {
  it('removeTask takes the task away entirely (it never happened)', async () => {
    const { removeTask, addTasks } = await import('./shift')
    const { quickTapTask } = await import('../../shared/quickTap')
    const base = { version: 1 as const, startedAt: 0, tasks: [], log: [] }
    const added = addTasks(base, [quickTapTask('water', 4, 10, 'q1'), quickTapTask('check', 7, 10, 'q2')])
    const undone = removeTask(added, 'q1')
    expect(undone.tasks.map((t) => t.id)).toEqual(['q2'])
    expect(added.tasks).toHaveLength(2) // pure: original untouched
  })
})
