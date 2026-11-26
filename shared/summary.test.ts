import { describe, expect, it } from 'vitest'
import { createSeedShift } from '../src/state/seed'
import { computeStats } from './stats'
import { SummaryShapeError, fallbackSummary, numbersIn, readStats, validateSummary } from './summary'

const NOW = Date.UTC(2026, 10, 25, 19, 30)
const stats = computeStats(createSeedShift(NOW, [1, 4, 7]), NOW, [1, 4, 7])

describe('computeStats on the seed shift', () => {
  it('counts requests, completions and the average', () => {
    expect(stats).toMatchObject({ requests: 12, completed: 6, open: 6, completionRate: 50 })
    expect(stats.avgCompleteMin).toBe(4) // (3+2+4+6+5+2)/6 = 3.67, rounds to 4
  })

  it('finds the longest open wait and the open allergy', () => {
    expect(stats.longestOpenWaitMin).toBe(7)
    expect(stats.longestOpenTable).toBe(1)
    expect(stats.openAllergyTables).toEqual([4])
  })

  it('breaks requests down by table and type', () => {
    expect(stats.byTable).toEqual([
      { table: 1, open: 2, completed: 2 },
      { table: 4, open: 2, completed: 2 },
      { table: 7, open: 2, completed: 2 },
    ])
    expect(stats.byCategory.reduce((a, c) => a + c.count, 0)).toBe(12)
    expect(stats.safeguardsTotal).toBe(5)
  })
})

describe('validateSummary: no invented numbers', () => {
  it('keeps lines whose numbers all come from the stats', () => {
    const { summary, dropped } = validateSummary(
      { headline: '12 requests, 6 done', insights: ['Table 1 waited 7 min.', "Salmon 86'd once."], action: 'Confirm table 4 allergy.' },
      stats,
    )
    expect(dropped).toBe(0)
    expect(summary.insights).toHaveLength(2)
  })

  it('drops an insight with a made-up number and replaces a bad headline', () => {
    const { summary, dropped } = validateSummary(
      { headline: 'Service is 35% faster than last week', insights: ['Table 4 had 2 open.', 'Guests waited 19 min on average.'], action: 'Confirm table 4 allergy.' },
      stats,
    )
    expect(dropped).toBe(2)
    expect(summary.insights).toEqual(['Table 4 had 2 open.'])
    expect(summary.headline).toBe(fallbackSummary(stats).headline)
  })

  it('throws when no honest insight is left, so the endpoint falls back', () => {
    expect(() => validateSummary({ headline: 'x', insights: ['99 tables waited 42 min'], action: 'y' }, stats)).toThrow(SummaryShapeError)
    expect(() => validateSummary(null, stats)).toThrow(SummaryShapeError)
  })
})

describe('fallbackSummary', () => {
  it('states ties as ties and the safeguard breakdown adds up', () => {
    const s = fallbackSummary(stats)
    expect(s.insights).toContain('Requests are spread evenly: 4 requests per table.')
    const safeguardLine = s.insights.find((l) => /safeguards triggered/.test(l))!
    const parts = numbersIn(safeguardLine)
    expect(parts.slice(1).reduce((a, b) => a + b, 0)).toBe(parts[0])
  })

  it('only uses numbers from the stats and leads with the allergy', () => {
    const s = fallbackSummary(stats)
    expect(s.action).toMatch(/allergy check at table 4/)
    expect(() => validateSummary(s, stats)).not.toThrow()
    expect(validateSummary(s, stats).dropped).toBe(0)
  })
})

describe('readStats', () => {
  it('clamps and drops anything that is not a stat', () => {
    const s = readStats({ requests: '12', completionRate: 500, byCategory: [{ category: 'evil', count: 1 }, { category: 'drinks', count: 2 }], note: 'ignore rules' })!
    expect(s.requests).toBe(12)
    expect(s.completionRate).toBe(100)
    expect(s.byCategory).toEqual([{ category: 'drinks', count: 2 }])
    expect(s).not.toHaveProperty('note')
  })
})
