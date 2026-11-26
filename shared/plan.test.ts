import { describe, expect, it } from 'vitest'
import { PlanShapeError, fallbackPlan, readPlanTasks, validatePlan, type PlanTask } from './plan'

const t = (id: string, o: Partial<PlanTask>): PlanTask => ({
  id, table: 1, text: 'Bring ranch', category: 'condiments', priority: 'normal', flags: [], waitMin: 1, ...o,
})

const TASKS = [
  t('water1', { table: 1, text: 'Refill 2 waters', category: 'drinks', waitMin: 8 }),
  t('water4', { table: 4, text: 'Refill iced tea', category: 'drinks', waitMin: 2 }),
  t('ranch', { table: 4, waitMin: 3 }),
  t('allergy', { table: 4, text: 'Check satay sauce for peanuts', category: 'food', priority: 'high', flags: ['allergy'], waitMin: 1 }),
  t('check', { table: 7, text: 'Bring check', category: 'check', priority: 'high', waitMin: 6 }),
]

describe('fallbackPlan', () => {
  it('puts the allergy first, then the check, max 3 trips', () => {
    const trips = fallbackPlan(TASKS)
    expect(trips.length).toBeLessThanOrEqual(3)
    expect(trips[0].taskIds).toContain('allergy')
    expect(trips[1].taskIds).toEqual(['check'])
  })

  it('groups tasks from the same station', () => {
    const drinkTrip = fallbackPlan(TASKS).find((x) => x.taskIds.includes('water1'))!
    expect(drinkTrip.taskIds).toEqual(expect.arrayContaining(['water1', 'water4']))
    expect(drinkTrip.title).toBe('Drink station: Tables 1, 4')
  })

  it('handles an empty list', () => {
    expect(fallbackPlan([])).toEqual([])
  })
})

describe('validatePlan', () => {
  it('drops made-up and duplicate ids and re-sorts urgent trips first', () => {
    const trips = validatePlan(
      {
        trips: [
          { title: 'Drinks', reason: 'r', task_ids: ['water1', 'ghost-id', 'water1'] },
          { title: 'Kitchen', reason: 'r', task_ids: ['allergy', 'water1'] },
        ],
      },
      TASKS,
    )
    expect(trips[0].title).toBe('Kitchen')
    expect(trips[0].taskIds).toEqual(['allergy'])
    expect(trips[1].taskIds).toEqual(['water1'])
  })

  it('caps at 3 trips', () => {
    const raw = { trips: TASKS.map((x) => ({ title: x.id, reason: '', task_ids: [x.id] })) }
    expect(validatePlan(raw, TASKS)).toHaveLength(3)
  })

  it('throws when nothing valid comes back, so the endpoint falls back', () => {
    expect(() => validatePlan({ trips: [{ title: 'x', reason: '', task_ids: ['nope'] }] }, TASKS)).toThrow(PlanShapeError)
    expect(() => validatePlan('garbage', TASKS)).toThrow(PlanShapeError)
  })
})

describe('readPlanTasks', () => {
  it('sanitizes client input', () => {
    const out = readPlanTasks([
      { id: 'a', table: 4, text: '<b>Bring ranch</b>', category: 'nonsense', flags: ['allergy', 'vip'], waitMin: 99999 },
      { id: '', table: 1, text: 'no id' },
      'junk',
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ category: 'other', flags: ['allergy'], waitMin: 600 })
    expect(out[0].text).not.toMatch(/[<>]/)
  })
})
