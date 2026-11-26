import { describe, expect, it } from 'vitest'
import type { Task } from '../../shared/types'
import { newlyOverdue, overdueCount, sortTableTasks, tabTitle } from './overdue'

const MIN = 60_000
const NOW = 100 * MIN
const task = (id: string, ageMin: number, priority: Task['priority'] = 'normal'): Task => ({
  id, table: 4, text: id, category: 'other', priority, flags: [], note: '', createdAt: NOW - ageMin * MIN, doneAt: null, source: 'quick',
})

describe('overdue alerts', () => {
  it('tasks open 5+ minutes move to the top of their table, oldest first', () => {
    const sorted = sortTableTasks([task('allergy-new', 1, 'high'), task('water-6m', 6), task('napkins-9m', 9, 'low'), task('ranch-2m', 2)], NOW)
    expect(sorted.map((t) => t.id)).toEqual(['napkins-9m', 'water-6m', 'allergy-new', 'ranch-2m'])
  })

  it('counts overdue tasks for the tab title', () => {
    const tasks = [task('a', 6), task('b', 12), task('c', 4), { ...task('d', 30), doneAt: NOW }]
    expect(overdueCount(tasks, NOW)).toBe(2)
    expect(tabTitle(2)).toBe('(2) Waiterly')
    expect(tabTitle(0)).toBe('Waiterly')
  })

  it('reports a task once, when it first becomes overdue (not old ones on page load)', () => {
    const seen = new Set<string>()
    const tasks = [task('old', 20), task('soon', 4)]
    expect(newlyOverdue(tasks, NOW, seen, true)).toEqual([]) // first check: just remember
    expect(newlyOverdue(tasks, NOW + MIN, seen, false)).toEqual(['soon'])
    expect(newlyOverdue(tasks, NOW + 2 * MIN, seen, false)).toEqual([]) // only once
  })
})
