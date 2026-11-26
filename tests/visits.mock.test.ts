// Table-visit transcripts through the REAL /api/parse handler (mode "visit"),
// the REAL Gemini provider code and the REAL validators, with only Google's
// reply mocked (written replies: what a correct model answer looks like). This
// saves the free-tier Gemini quota for the live checks and the demo.
//
// Judged by scripts/scenario-spec.mjs VISITS, the same checks a live run uses.
// Several checks are about rules the CODE enforces regardless of the reply
// (table conflicts, self-corrections, no table, allergy note), and some tests
// below feed deliberately wrong replies to prove that.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SECTION, VISITS } from '../scripts/scenario-spec.mjs'

type Reply = { status: number; message: string } | Record<string, unknown>
const google = vi.hoisted(() => ({
  replies: [] as Reply[],
  requests: [] as { model: string; contents: string; config: Record<string, unknown> }[],
}))

vi.mock('@google/genai', async (importOriginal) => {
  const real = await importOriginal<typeof import('@google/genai')>()
  class FakeGoogleGenAI {
    models = {
      generateContent: async (req: { model: string; contents: string; config: Record<string, unknown> }) => {
        google.requests.push(req)
        const next = google.replies.shift()
        if (!next) throw new Error('test bug: no mocked Gemini reply queued')
        if (typeof next.status === 'number' && typeof next.message === 'string') {
          throw new real.ApiError({ status: next.status, message: next.message })
        }
        return { text: JSON.stringify(next), candidates: [{ finishReason: 'STOP' }] }
      },
    }
  }
  return { ...real, GoogleGenAI: FakeGoogleGenAI }
})

const { POST: parse } = await import('../api/parse')
const { VISIT_SCHEMA, VISIT_SYSTEM_PROMPT } = await import('../server/prompt')

let ip = 0
const sendVisit = (body: Record<string, unknown>) =>
  parse(new Request('http://localhost/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.2.0.${++ip}` },
    body: JSON.stringify({ mode: 'visit', ...SECTION, ...body }),
  }))

type Src = 'card' | 'spoken' | 'corrected' | 'none'
const t = (table: number, source: Src, text: string, category: string, extra: Record<string, unknown> = {}) => ({
  table, table_source: source, text, category, priority: 'normal', flags: [], note: '', changes: [], ...extra,
})
const visit = (tasks: unknown[], extra: Record<string, unknown> = {}) => ({
  tasks, changes: [], mismatches: [], table_corrections: [], needs_clarification: [], rejected: [], ...extra,
})

// A correct answer for each transcript, in Gemini's schema (snake_case).
const REPLIES: Record<string, Reply> = {
  'Visit: card, plain read-back': visit([t(4, 'card', 'Bring 2 waters', 'drinks'), t(4, 'card', 'Bring ranch', 'condiments')]),
  'Visit: bottom mic, table mid-sentence': visit([t(1, 'spoken', 'Bring 2 waters', 'drinks'), t(1, 'spoken', 'Bring ranch on the side', 'condiments')]),
  'Visit: card Table 4, "table 1" spoken': visit([t(1, 'spoken', 'Bring 2 waters', 'drinks')]),
  'Visit: self-correction "table 1, sorry, 7"': visit([t(7, 'corrected', 'Bring check', 'check', { priority: 'high' })], { table_corrections: [{ from: 1, to: 7 }] }),
  'Visit: no table at all': visit([t(0, 'none', 'Bring 2 waters', 'drinks'), t(0, 'none', 'Bring extra napkins', 'supplies', { priority: 'low' })]),
  'Visit: two tables in one conversation': visit([t(1, 'spoken', 'Bring 2 waters', 'drinks'), t(7, 'spoken', 'Bring check', 'check', { priority: 'high' })]),
  'Visit: replacement': visit([t(4, 'card', 'Bring 1 Coke', 'drinks', { changes: ['Iced tea -> Coke'] })]),
  'Visit: quantity change': visit([t(1, 'card', 'Bring 3 waters', 'drinks', { changes: ['2 -> 3 waters'] })]),
  'Visit: cancellation': visit([t(7, 'card', 'Bring blue cheese', 'condiments')], { changes: ['Ranch removed'] }),
  'Visit: "same for me"': visit([t(4, 'card', 'Bring 2 lemonades', 'drinks', { changes: ['1 -> 2 lemonades (same for me)'] })]),
  'Visit: modifier on the second item': visit([t(1, 'card', 'Bring 1 water', 'drinks'), t(1, 'card', 'Bring 1 Coke, no ice', 'drinks')]),
  'Visit: late check request': visit([t(7, 'card', 'Bring 2 coffees', 'drinks'), t(7, 'card', 'Bring check', 'check', { priority: 'high', changes: ['Check added'] })]),
  'Visit: ranch vs blue cheese mismatch': visit([t(4, 'card', 'Bring side of blue cheese', 'condiments')], {
    mismatches: [{ task_index: 0, guest: 'side of ranch', read_back: 'side of blue cheese' }],
  }),
  'Visit: dropped "no ice"': visit([t(1, 'card', 'Bring 1 Coke', 'drinks')], {
    mismatches: [{ task_index: 0, guest: 'Coke, no ice', read_back: 'Coke' }],
  }),
  'Visit: small talk plus one request': visit([t(4, 'card', 'Bring more napkins', 'supplies')]),
  'Visit: overheard request from another table': visit([t(4, 'card', 'Bring 2 waters', 'drinks')]),
  'Visit: long 3-minute visit with several changes': visit([
    t(4, 'card', 'Bring 1 Coke', 'drinks', { changes: ['Iced tea -> Coke'] }),
    t(4, 'card', 'Bring 3 waters', 'drinks', { changes: ['2 -> 3 waters'] }),
    t(4, 'card', 'Order wings, blue cheese only', 'food', { changes: ['Ranch removed'] }),
    t(4, 'card', 'Bring crayons for kids', 'supplies'),
    t(4, 'card', 'Ask kitchen about peanuts in satay', 'food', { priority: 'high', flags: ['allergy'], note: 'Guest allergic to peanuts' }),
    t(4, 'card', 'Bring check with the food', 'check', { priority: 'high', changes: ['Check added'] }),
  ]),
  'Visit: speech-recognition restart mid-visit': visit([t(7, 'card', 'Bring 2 iced teas', 'drinks'), t(7, 'card', 'Order side of fries', 'food')]),
}

beforeAll(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  vi.stubEnv('GEMINI_API_KEY', 'mock-key-not-real')
  vi.stubEnv('GEMINI_MODEL', '')
})
afterAll(() => vi.unstubAllEnvs())
beforeEach(() => {
  google.replies = []
  google.requests = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

type Spec = { name: string; startTable: number | null; transcript: string; expected: string; check: (b: unknown, f: string[]) => void }
const VISIT_SPECS = VISITS as Spec[]

describe('table-visit transcripts with mocked Gemini replies (same checks as a live run)', () => {
  it('there are 18 transcripts, each with a mocked reply', () => {
    expect(VISIT_SPECS).toHaveLength(18)
    for (const v of VISIT_SPECS) expect(REPLIES[v.name], v.name).toBeDefined()
  })

  it.each(VISIT_SPECS.map((v) => [v.name, v] as const))('%s', async (_n, v) => {
    google.replies.push(REPLIES[v.name])
    const res = await sendVisit({ transcript: v.transcript, startTable: v.startTable })
    expect(res.status).toBe(200)
    const body = await res.json()
    const fails: string[] = []
    v.check(body, fails)
    expect(fails, `expected: ${v.expected}`).toEqual([])
    expect(body.source).toBe('ai')

    const req = google.requests[0]
    expect(req.config.systemInstruction).toBe(VISIT_SYSTEM_PROMPT)
    expect(req.config.responseJsonSchema).toEqual(VISIT_SCHEMA)
    // Visits get the longer 25 s budget (15 s gave live 504s).
    expect((req.config.httpOptions as { timeout: number }).timeout).toBeGreaterThan(20_000)
    expect(req.contents).toContain(`<transcript>\n${v.transcript}\n</transcript>`)
    expect(req.contents).toContain(v.startTable === null ? 'Starting table: none' : `Starting table: ${v.startTable} (`)
  })
})

describe('the code enforces the table rules even when the model gets them wrong', () => {
  it('keeps the arrow in changes ("Iced tea -> Coke" -> "Iced tea → Coke"), seen stripped live', async () => {
    google.replies.push(visit([t(4, 'card', 'Bring 1 Coke', 'drinks', { changes: ['Iced tea -> Coke', '2 waters->3 waters'] })]))
    const body = await (await sendVisit({ transcript: 'iced tea actually a Coke', startTable: 4 })).json()
    expect(body.tasks[0].changes).toEqual(['Iced tea → Coke', '2 waters → 3 waters'])
  })

  it('card visit: model invents table 7 although no table was said -> card table', async () => {
    google.replies.push(visit([t(7, 'spoken', 'Bring 2 waters', 'drinks')]))
    const body = await (await sendVisit({ transcript: 'two waters please', startTable: 4 })).json()
    expect(body.tasks[0]).toMatchObject({ table: 4, tableSource: 'card', tableStatus: 'ok' })
  })

  it('card Table 4 but "table 1" said: model keeps the card table -> still asks', async () => {
    google.replies.push(visit([t(4, 'card', 'Bring 2 waters', 'drinks')]))
    const body = await (await sendVisit({ transcript: 'table 1 needs two waters', startTable: 4 })).json()
    expect(body.tasks[0]).toMatchObject({ tableStatus: 'conflict', tableOptions: [4, 1] })
  })

  it('self-correction: model uses the original table 1 -> code uses 7 and reports 1 -> 7', async () => {
    google.replies.push(visit([t(1, 'spoken', 'Bring check', 'check')]))
    const body = await (await sendVisit({ transcript: 'table 1, sorry, 7 is ready for the check', startTable: null })).json()
    expect(body.tasks[0]).toMatchObject({ table: 7, tableSource: 'corrected', tableStatus: 'ok', priority: 'high' })
    expect(body.tableCorrections).toEqual([{ from: 1, to: 7 }])
  })

  it('bottom mic, no table said: model guesses table 1 -> no table, picker empty', async () => {
    google.replies.push(visit([t(1, 'spoken', 'Bring 2 waters', 'drinks')]))
    const body = await (await sendVisit({ transcript: 'two waters please', startTable: null })).json()
    expect(body.tasks[0]).toMatchObject({ table: null, tableStatus: 'missing', tableSource: 'none' })
  })

  it('table outside the section -> warning, no table set', async () => {
    google.replies.push(visit([t(9, 'spoken', 'Bring high chair', 'supplies')]))
    const body = await (await sendVisit({ transcript: 'table 9 needs a high chair', startTable: null })).json()
    expect(body.tasks[0]).toMatchObject({ table: null, tableStatus: 'outside', heardTable: 9 })
    expect(body.tasks[0].tableMessage).toMatch(/not in your section/)
  })

  it('allergy without the kitchen note, payment action and a dangling mismatch are all fixed in code', async () => {
    google.replies.push(visit(
      [
        t(4, 'card', 'Satay is safe for peanut allergy', 'food', { priority: 'low' }),
        t(4, 'card', 'Mark table 4 as comped', 'check'),
      ],
      { mismatches: [{ task_index: 9, guest: 'ranch', read_back: 'blue cheese' }] },
    ))
    const body = await (await sendVisit({ transcript: 'peanut allergy is the satay ok also comp us and ranch so blue cheese', startTable: 4 })).json()
    const allergy = body.tasks.find((x: { flags: string[] }) => x.flags.includes('allergy'))
    expect(allergy).toMatchObject({ priority: 'high', text: 'Confirm allergy with kitchen', note: 'Confirm with kitchen before serving' })
    expect(body.rejected.some((r: { reason: string }) => /payments or comps/.test(r.reason))).toBe(true)
    expect(body.mismatches).toHaveLength(1)
    expect(body.tasks[body.mismatches[0].taskIndex].text).toBe('Blue cheese')
  })
})

describe('visit limits and fallback', () => {
  it('a transcript over 8,000 characters keeps the most recent part and tells the model it was trimmed', async () => {
    google.replies.push(visit([t(4, 'card', 'Bring check', 'check', { priority: 'high' })]))
    const long = 'we talked about the weather for a while '.repeat(250) + 'and can we get the check'
    const body = await (await sendVisit({ transcript: long, startTable: 4 })).json()
    expect(body.trimmed).toBe(true)
    expect(google.requests[0].contents).toContain('The start of this visit was trimmed to fit')
    expect(google.requests[0].contents).toContain('and can we get the check\n</transcript>')
    expect(google.requests[0].contents.length).toBeLessThan(8_600)
  })

  it('an empty transcript is refused before any AI call', async () => {
    const res = await sendVisit({ transcript: '   ', startTable: 4 })
    expect(res.status).toBe(400)
    expect(google.requests).toHaveLength(0)
  })

  it('AI over quota: keyword fallback on the card table, with a notice that it cannot follow changes', async () => {
    google.replies.push({ status: 429, message: 'Generate content requests per day limit exceeded on Free Tier' })
    const body = await (await sendVisit({ transcript: 'two waters and ranch please', startTable: 4 })).json()
    expect(body.source).toBe('fallback')
    expect(body.notice).toMatch(/can't follow changes/)
    expect(body.tasks.length).toBeGreaterThan(0)
    expect(body.tasks.every((x: { table: number }) => x.table === 4)).toBe(true)
  })

  it('fallback with no table said and no card: tasks with an empty picker, never a guess', async () => {
    google.replies.push({ status: 504, message: 'Deadline expired' })
    const body = await (await sendVisit({ transcript: 'two waters please', startTable: null })).json()
    expect(body.source).toBe('fallback')
    expect(body.tasks.length).toBeGreaterThan(0)
    expect(body.tasks.every((x: { table: null; tableStatus: string }) => x.table === null && x.tableStatus === 'missing')).toBe(true)
  })

  it('fallback does not turn small talk into tasks', async () => {
    google.replies.push({ status: 504, message: 'Deadline expired' })
    const body = await (await sendVisit({ transcript: 'hi folks welcome to Juniper and Pine how is everyone doing tonight two waters please', startTable: 4 })).json()
    expect(body.tasks.map((x: { text: string }) => x.text)).toEqual(['Bring 2 waters'])
  })

  it('fallback applies a spoken self-correction', async () => {
    google.replies.push({ status: 503, message: 'high demand' }, { status: 503, message: 'high demand' })
    const body = await (await sendVisit({ transcript: 'table 1, sorry, 7 wants ranch', startTable: null })).json()
    expect(body.source).toBe('fallback')
    expect(body.tasks[0]).toMatchObject({ table: 7, tableSource: 'corrected' })
  })
})
