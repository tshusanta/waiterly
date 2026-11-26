// Send the spec scenarios to a running Waiterly, check each result against the
// spec's expected outcome, and print (and optionally save) what came back.
//
// Usage: node scripts/run-scenarios.mjs [baseUrl] [flags]
//   --only "Allergy,Shift summary"  run just these scenarios (names from scenario-spec.mjs)
//   --max-ai-calls N   hard cap on requests that can reach the AI. Default: 8 for any
//                      non-local URL (protects the 20/day Gemini free tier), unlimited locally.
//   --require-ai       a fallback answer counts as FAIL (use when testing the real model)
//   --delay ms         pause between requests
//   --parse-only       skip the trip plan and shift summary
//   --json out.json    save the raw results (never overwrites; adds a timestamp)
//
// Free-tier budgeting: each AI-bound request is one Gemini call, or two if Google
// answers 503 and the server retries once. Validation scenarios (empty / too long)
// are refused before any AI call and are not counted.
import { SCENARIOS, EXTRAS, SECTION } from './scenario-spec.mjs'

const base = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:5173'
const argValue = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : null)
const jsonOut = argValue('--json')
const delayMs = Number(argValue('--delay') ?? 0)
const requireAi = process.argv.includes('--require-ai')
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(base)
const maxAiCalls = Number(argValue('--max-ai-calls') ?? (isLocal ? Infinity : 8))
const only = argValue('--only')?.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)

const all = [
  ...SCENARIOS.map((s) => ({ ...s, path: '/api/parse', payload: { note: s.note, ...SECTION } })),
  ...(process.argv.includes('--parse-only') ? [] : EXTRAS.map((x) => ({ ...x, usesAi: true }))),
]
const selected = only ? all.filter((s) => only.includes(s.name.toLowerCase())) : all
if (only && selected.length !== only.length) {
  const known = all.map((s) => s.name.toLowerCase())
  console.error(`Unknown scenario name(s): ${only.filter((n) => !known.includes(n)).join(', ')}. Known: ${all.map((s) => s.name).join(', ')}`)
  process.exit(2)
}
const aiBound = selected.filter((s) => s.usesAi !== false).length
console.log(`Target ${base} · ${selected.length} scenario(s), ${aiBound} can reach the AI · cap ${maxAiCalls === Infinity ? 'none' : maxAiCalls}`)

const aiCheck = (b, f, status) => {
  if (requireAi && status === 200 && b.source !== 'ai') f.push(`fell back instead of using AI (${b.reason ?? 'unknown'}: ${b.notice ?? ''})`)
}
const pause = () => new Promise((r) => setTimeout(r, delayMs))

const results = []
let aiCalls = 0
for (const s of selected) {
  if (s.usesAi !== false) {
    if (aiCalls >= maxAiCalls) {
      console.log(`\n=== SKIP  ${s.name}  (AI call cap of ${maxAiCalls} reached; raise --max-ai-calls to run it)`)
      results.push({ name: s.name, expected: s.expected, skipped: true, pass: false, fails: ['skipped: AI call cap'], body: {} })
      continue
    }
    aiCalls++
  }
  if (results.length) await pause()
  const started = Date.now()
  const res = await fetch(`${base}${s.path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s.payload) })
  const body = await res.json()
  const ms = Date.now() - started
  const fails = []
  s.check(body, fails, res.status)
  aiCheck(body, fails, res.status)
  const pass = fails.length === 0
  results.push({ name: s.name, note: s.note, expected: s.expected, status: res.status, ms, pass, fails, body })

  console.log(`\n=== ${pass ? 'PASS' : 'FAIL'}  ${s.name}  [HTTP ${res.status}, ${ms} ms${body.source ? `, ${body.source}` : ''}]`)
  console.log(`expected: ${s.expected}`)
  for (const msg of fails) console.log(`  ! ${msg}`)
  if (body.error) console.log(`  error: ${body.error}`)
  if (body.notice) console.log(`  notice: ${body.notice}`)
  if (s.print) { s.print(body); continue }
  for (const t of body.tasks ?? []) {
    console.log(`  task  T${t.table}  ${t.priority.padEnd(6)} ${t.category.padEnd(10)} ${t.text}${t.flags.length ? `  [${t.flags.join(',')}]` : ''}${t.note ? `  (${t.note})` : ''}`)
  }
  for (const c of body.needs_clarification ?? []) console.log(`  ask   ${c.question}`)
  for (const r of body.rejected ?? []) console.log(`  rej   ${r.request} -> ${r.reason}`)
  for (const k of body.skipped ?? []) console.log(`  skip  ${k}`)
}

const passed = results.filter((r) => r.pass).length
const sources = [...new Set(results.map((r) => r.body.source).filter(Boolean))]
console.log(`\n${passed}/${results.length} passed. Parser used: ${sources.join(', ') || 'n/a'}. AI-bound requests sent: ${aiCalls}.`)

if (jsonOut) {
  const { writeFileSync, mkdirSync, existsSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  mkdirSync(dirname(jsonOut), { recursive: true })
  // Never overwrite an earlier run: add a timestamp if the file already exists.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const out = existsSync(jsonOut) ? jsonOut.replace(/\.json$/, `-${stamp}.json`) : jsonOut
  writeFileSync(out, JSON.stringify({ base, ranAt: new Date().toISOString(), requireAi, aiCalls, passed, total: results.length, sources, results }, null, 2))
  console.log(`Saved ${out}`)
}
process.exitCode = passed === results.length ? 0 : 1
