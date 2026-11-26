// Endpoint integration tests. They call the real handlers with a fake AI
// provider, so we can make the "model" misbehave on purpose and prove the
// server-side safeguards catch it. Without an API key this is the honest way
// to test the AI path. The live model run is separate (see docs/TEST_RESULTS.md).
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  configured: true,
  parse: null as null | (() => Promise<unknown>),
  plan: null as null | (() => Promise<unknown>),
  summary: null as null | (() => Promise<unknown>),
  breakFallback: false,
}))

// Fake provider: a null handler behaves like "no API key set".
vi.mock('../server/provider.js', async () => {
  const { AiNotConfiguredError, AiUnavailableError } = await import('../server/providers/types.js')
  const notSet = () => Promise.reject(new AiNotConfiguredError())
  return {
    AiNotConfiguredError,
    AiUnavailableError,
    getProvider: () => ({
      name: 'fake',
      label: 'Fake',
      models: { parse: 'fake', plan: 'fake', summary: 'fake' },
      isConfigured: () => fake.configured,
      parseNote: () => (fake.parse ?? notSet)(),
      planTrips: () => (fake.plan ?? notSet)(),
      summarizeShift: () => (fake.summary ?? notSet)(),
    }),
  }
})

// Lets a test break the fallback parser itself, to prove the safety net.
vi.mock('../shared/parse/fallback.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../shared/parse/fallback.js')>()
  return {
    ...real,
    fallbackParse: (note: string) => {
      if (fake.breakFallback) throw new TypeError('simulated bug in fallback')
      return real.fallbackParse(note)
    },
  }
})

const { POST: parse } = await import('../api/parse')
const { POST: plan } = await import('../api/plan')
const { POST: summary } = await import('../api/summary')
const { GET: health } = await import('../api/health')

let ip = 0
function req(body: unknown, opts: { raw?: string; ip?: string } = {}) {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': opts.ip ?? `10.0.0.${++ip}` },
    body: opts.raw ?? JSON.stringify(body),
  })
}
const SECTION = { assignedTables: [1, 4, 7], openTasks: [] }
const timeoutError = () => Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' })

beforeEach(() => {
  fake.configured = true
  fake.parse = fake.plan = fake.summary = null
  fake.breakFallback = false
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/parse: input validation (no AI call)', () => {
  it('rejects an empty note with a friendly message', async () => {
    const calls = vi.fn()
    fake.parse = async () => (calls(), { tasks: [] })
    const res = await parse(req({ note: '   ', ...SECTION }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Type or dictate a note first.')
    expect(calls).not.toHaveBeenCalled()
  })

  it('rejects a 700-character note', async () => {
    const res = await parse(req({ note: 'a'.repeat(700), ...SECTION }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/too long \(700 characters\)/)
  })

  it('rejects a body that is not JSON', async () => {
    const res = await parse(req(null, { raw: 'note=hi' }))
    expect(res.status).toBe(400)
  })

  it('rate-limits after 20 requests per minute from one IP', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 22; i++) statuses.push((await parse(req({ note: '4 wants ranch', ...SECTION }, { ip: '10.9.9.9' }))).status)
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(20)).toEqual([429, 429])
    const res = await parse(req({ note: '4 wants ranch', ...SECTION }, { ip: '10.9.9.9' }))
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
  })
})

describe('POST /api/parse: fallback', () => {
  it('uses the keyword parser when no key is set, and says so', async () => {
    const res = await parse(req({ note: '4 wants ranch', ...SECTION }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ source: 'fallback', reason: 'not_configured' })
    expect(body.notice).toMatch(/not configured on this server \(no API key\)/)
    expect(body.tasks[0]).toMatchObject({ table: 4, text: 'Bring ranch' })
  })

  it('never returns a 500: a bug in the fallback still gives a safe 200 answer', async () => {
    fake.breakFallback = true
    const res = await parse(req({ note: '4 wants ranch', ...SECTION }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ source: 'fallback', tasks: [] })
    expect(body.notice).toMatch(/Nothing was added/)
  })

  it('falls back on a timeout with a timeout message', async () => {
    fake.parse = () => Promise.reject(timeoutError())
    const body = await (await parse(req({ note: '4 wants ranch', ...SECTION }))).json()
    expect(body.source).toBe('fallback')
    expect(body.notice).toMatch(/took too long/)
  })

  it('falls back when the model returns the wrong shape', async () => {
    fake.parse = async () => ({ answer: 'sure!' })
    const body = await (await parse(req({ note: '4 wants ranch', ...SECTION }))).json()
    expect(body.source).toBe('fallback')
    expect(body.tasks).toHaveLength(1)
  })
})

describe('POST /api/parse: a misbehaving model is caught in code', () => {
  it('rejects out-of-section tables, payment actions and invented tables; forces allergy rules; strips markup', async () => {
    fake.parse = async () => ({
      tasks: [
        { table: 9, text: 'Bring high chair', category: 'supplies', priority: 'normal', flags: [], note: '' },
        { table: 1, text: 'Mark table 1 as paid', category: 'check', priority: 'high', flags: [], note: '' },
        { table: 7, text: 'Bring bread', category: 'food', priority: 'normal', flags: [], note: '' },
        { table: 4, text: 'Satay is safe for peanut allergy', category: 'food', priority: 'low', flags: [], note: 'all good' },
        { table: 4, text: '<script>alert(1)</script>Bring lemon', category: 'condiments', priority: 'normal', flags: ['vip'], note: '' },
      ],
      needs_clarification: [],
      rejected: [],
    })
    const note = 'table 4 peanut allergy, satay ok? lemon too. 9 needs a high chair, the window guy wants bread, comp table 1'
    const body = await (await parse(req({ note, ...SECTION }))).json()

    expect(body.source).toBe('ai')
    expect(body.rejected.map((r: { reason: string }) => r.reason)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Table 9 is not in your section/), expect.stringMatching(/payments or comps/)]),
    )
    expect(body.needs_clarification.map((c: { question: string }) => c.question)).toEqual([expect.stringMatching(/bread/i)])
    const allergy = body.tasks.find((t: { flags: string[] }) => t.flags.includes('allergy'))
    expect(allergy).toMatchObject({ table: 4, priority: 'high', text: 'Confirm allergy with kitchen', note: 'Confirm with kitchen before serving' })
    const lemon = body.tasks.find((t: { text: string }) => /lemon/i.test(t.text))
    expect(lemon.text).not.toMatch(/[<>]/)
    expect(lemon.flags).toEqual([])
    expect(body.tasks).toHaveLength(2)
  })

  it('caps a runaway response at 15 tasks', async () => {
    fake.parse = async () => ({
      tasks: Array.from({ length: 40 }, (_, i) => ({ table: 4, text: `Bring item ${i}`, category: 'other', priority: 'normal', flags: [], note: '' })),
    })
    const body = await (await parse(req({ note: 'table 4 wants lots', ...SECTION }))).json()
    expect(body.tasks.length).toBeLessThanOrEqual(15)
  })
})

describe('POST /api/plan', () => {
  const tasks = [
    { id: 'a', table: 4, text: 'Check satay for peanuts', category: 'food', priority: 'high', flags: ['allergy'], waitMin: 1 },
    { id: 'b', table: 1, text: 'Refill 2 waters', category: 'drinks', priority: 'normal', flags: [], waitMin: 8 },
  ]

  it('drops task ids the model made up', async () => {
    fake.plan = async () => ({ trips: [{ title: 'Drinks', reason: 'x', task_ids: ['b', 'ghost'] }, { title: 'Kitchen', reason: 'y', task_ids: ['a'] }] })
    const body = await (await plan(req({ tasks }))).json()
    expect(body.source).toBe('ai')
    expect(body.trips.map((t: { taskIds: string[] }) => t.taskIds)).toEqual([['a'], ['b']]) // allergy trip first
  })

  it('falls back to the rule-based planner', async () => {
    const body = await (await plan(req({ tasks }))).json()
    expect(body.source).toBe('fallback')
    expect(body.notice).toMatch(/rule-based planner/)
    expect(body.trips[0].taskIds).toEqual(['a'])
  })
})

describe('POST /api/summary', () => {
  const stats = { requests: 12, completed: 6, open: 6, completionRate: 50, avgCompleteMin: 4, longestOpenWaitMin: 7, longestOpenTable: 1, safeguards: { allergy: 1 }, openAllergyTables: [4], byTable: [], byCategory: [] }

  it('drops AI lines with invented numbers and says so', async () => {
    fake.summary = async () => ({
      headline: '12 requests so far, 6 done',
      insights: ['Average completion is 4 min.', 'Service is 30% faster than Tuesday.'],
      action: 'Confirm the table 4 allergy with the kitchen.',
    })
    const body = await (await summary(req({ stats }))).json()
    expect(body.source).toBe('ai')
    expect(body.insights).toEqual(['Average completion is 4 min.'])
    expect(body.notice).toMatch(/Removed 1 AI line/)
  })

  it('with no key, says "AI summary needs an API key" and returns the stats summary', async () => {
    const res = await summary(req({ stats }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ source: 'fallback', reason: 'not_configured' })
    expect(body.notice).toMatch(/^AI summary needs an API key/)
    expect(body.action).toMatch(/table 4/)
  })

  it('when the AI fails (not missing), says the AI is unavailable instead', async () => {
    fake.summary = () => Promise.reject(new Error('overloaded'))
    const body = await (await summary(req({ stats }))).json()
    expect(body).toMatchObject({ source: 'fallback', reason: 'ai_error' })
    expect(body.notice).toMatch(/unavailable/)
  })

  it('rejects a missing stats object', async () => {
    expect((await summary(req({}))).status).toBe(400)
  })
})

describe('GET /api/health', () => {
  it('reports configuration without exposing a key', async () => {
    fake.configured = false
    const body = await health().json()
    expect(body).toMatchObject({ ok: true, aiConfigured: false, provider: 'fake' })
    expect(JSON.stringify(body)).not.toMatch(/sk-|key=/i)
  })
})
