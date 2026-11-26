# TableTap Build Log

A chronological record of each phase: what was built, decisions made, problems hit and how they were solved. The **Who** column supports the course's AI use statement. "Agent" means Claude Code (Opus 5.5) wrote it, and "Student" means the student directed, decided or changed it.

---

## 2026-11-25: Kickoff and design research

| Item | Who | Notes |
|---|---|---|
| Project spec (`AGENT_PROMPT.md`) | Student | Defined the problem, stack, phases, safeguards, test scenarios and design rules. |
| Plan summary read back to the student | Agent | 8-bullet summary before any code. |
| Web research on avoiding generic AI UI | Agent | 3 searches: "AI slop UI", Anthropic frontend-design skill, Refactoring UI. |
| `docs/DESIGN_RULES.md` | Agent | 10 rules plus a per-phase checklist and sources. Decision: IBM Plex Sans + Plex Mono, because sources call Inter the top AI tell and Plex has tabular figures for wait timers. |
| Build log started | Agent | Updated at the end of every phase. |

**Problem hit:** The machine had no Node.js or Git. The student chose to install them via winget, and the agent ran `winget install OpenJS.NodeJS.LTS` (v26.13.1) and `Git.Git` (v2.56.1).

---

## 2026-11-25: Phase 0, Setup (done)

| Item | Who | Notes |
|---|---|---|
| Vite + React 19 + TypeScript scaffold | Agent | Written by hand (package.json, tsconfigs, index.html, src/) because `create-vite` won't run non-interactively in a non-empty folder. Versions: Vite 8.3, TS 7.0, Vitest 5.1, lucide-react 1.80. |
| `/api` folder with `api/health.ts` | Agent | Uses the Web-standard `GET(): Response` signature, which Vercel supports natively. It reports `aiConfigured: true/false` and never the key. |
| Split tsconfigs (`app` / `node` / `api`) | Agent | The browser code gets `vite/client` types and the serverless code gets `node` types, so `process.env` can't leak into frontend typings. |
| `.env.example`, `.gitignore`, README stub, `docs/` | Agent | `.gitignore` excludes `.env` and `.env.*` but keeps `.env.example`. |
| Git repo on `main` + first commit | Agent | Repo-local author set to the student's account. |

**How it was tested**
- `npm run build`: typecheck plus production build pass (223 kB JS, 70 kB gzip).
- `npm run dev`: the server returns HTTP 200 with the TableTap shell.
- `git status` was checked before committing: no `.env` and no `node_modules`.

**Problems and fixes**
- The first build failed because `process` was untyped in `api/` and the CSS import had no types. Fixed by splitting into a separate `tsconfig.api.json` with Node types and adding `vite/client` types to the app config.

**Known gap, handled in Phase 2:** plain `vite dev` doesn't run `/api` functions, so the shell shows "API: down" locally. Phase 2 will add a small Vite dev middleware that routes `/api/*` to the same handler files, so local testing doesn't need a Vercel login.

---

## 2026-11-25: Phase 1, Data model and seed data (done)

| Item | Who | Notes |
|---|---|---|
| `shared/types.ts` | Agent | `Task`, `SafeguardEvent`, `Settings`, `ShiftState`. Categories, priorities and flags are `as const` arrays, so the same lists serve as TypeScript types and as the server-side whitelists in Phase 2. |
| `shared/restaurant.ts` | Agent, from the student's spec | Juniper & Pine context: 86'd items (salmon, key lime pie), free refills, allergy policy, a synthetic menu, and the default section 1, 4, 7. `normalizeTables()` cleans the section list (whole numbers 1–30, unique, max 8). |
| `src/state/seed.ts` | Agent | 6 open and 6 done tasks plus 5 safeguard-log entries, timestamped relative to "now". Decision: seed tasks refer to section *slots*, not fixed numbers, so a reset after changing the section in Settings still produces sensible data. |
| `src/state/shift.ts` | Agent | Pure functions with no React: load, save, reset, add, complete, undo, log, plus the priority-then-age sort. They use a `KeyValueStore` interface so tests can pass a fake localStorage. |
| `src/state/useShift.ts` | Agent | React hook that wraps the pure functions and saves on every change. Settings are stored under a separate key so **Reset shift** keeps the section choice. |
| Phase 1 debug shell in `App.tsx` | Agent | Lists open tasks with Done and Reset buttons, just to prove the wiring. Replaced in Phase 3. |

**Decisions**
- Storage is versioned (`tabletap.shift.v1`). If the stored data is corrupt or missing, the app quietly reseeds instead of crashing.
- Storage failures (private mode, storage full) are caught, and the app keeps running in memory.

**How it was tested:** `npm test` passes 15/15 Vitest tests. They cover:
- Seed counts, whitelist compliance and realistic timestamps.
- At least one task waiting over 5 minutes, so the amber chip will show.
- The allergy note.
- Mapping the seed onto a custom section.
- Empty storage, corrupt storage and no storage.
- Save and reload round-trip, plus reset.
- Complete and undo, and the sort order.
- Settings normalization.

`npm run build` is clean.

---

## 2026-11-25: Phase 2, AI parsing endpoint (built; live AI test pending the API key)

| Item | Who | Notes |
|---|---|---|
| `server/prompt.ts`: system prompt + JSON schema | Agent, rules from the student's spec | All 8 spec rules word for word, plus restaurant context and 2 few-shot examples. The examples are deliberately *different* from the graded test scenarios, so the scenarios stay an honest test. Section tables and open tasks go in the user message, and the note sits inside `<note>` tags as data. |
| `server/ai.ts`: Claude call | Agent | `claude-haiku-5-5`, **structured outputs** (`output_config.format` json_schema) so the reply must match the schema. `effort: low` for speed, 15 s timeout, no retries (the fallback is faster than a retry). Any stop reason other than `end_turn` is treated as a failure. |
| `shared/parse/validate.ts`: server-side validation | Agent | Runs on AI output *and* fallback output. Whitelists category, priority and flags. Strips control characters and `<>`. Caps text at 8 words / 60 chars and at 15 tasks. Rules enforced in code, not just in the prompt: the table must be in the section (otherwise rejected); the table must actually appear in the note (otherwise a clarification, which catches invented tables); allergy means flag + high + kitchen note, with "is safe" claims rewritten; a sold-out item becomes "Tell guest X is 86'd"; checks and complaints are high; payment or comp actions are rejected; near-duplicates of open tasks are skipped. |
| `shared/parse/fallback.ts`: keyword parser | Agent | Splits the note into clauses and carries the table forward, except when a clause introduces a new party ("the guy by the window"). Leading numbers count as tables only when followed by a verb ("4 wants" yes, "two waters" no). Unknown requests come back as questions, never guesses. |
| `api/parse.ts` | Agent | Input checks: empty or over 600 chars gets a friendly 400, no AI call. Per-IP limit of 20/min returns 429 with Retry-After. JSON body capped at 32 KB. On any AI failure it falls back and returns `source: "fallback"` with a plain-language `notice`. |
| `vite-plugin-api.ts` | Agent | Dev-only middleware that runs the same `api/*.ts` handlers locally, so no Vercel login is needed to test. It loads `.env` server-side only (no `VITE_` prefix, so the key can't be bundled). |
| `scripts/run-scenarios.mjs` | Agent | Sends all spec scenarios to `/api/parse` and prints or saves the results. It gets reused in Phase 6 and on the live URL in Phase 7. |

**Decisions**
- Server-side imports use `.js` extensions (`../shared/types.js`) so the Vercel Node ESM runtime can resolve them. Risk to verify in Phase 7.
- Rate limiting is in-memory per serverless instance. That's fine for a demo but not a global limit; this goes in RISKS_AND_LIMITATIONS.

**Problems and fixes:** the first test run had 4 failing fallback cases, all fixed:
1. "the check, split three ways" was cut at the comma. Fix: rejoin ", split" before splitting.
2. "lemon for her water" also produced a water refill. Fix: the "for water" target is ignored when matching items.
3. "steak is cold and they want a manager" became 2 complaints. Fix: complaints for the same table merge.
4. "Bring ranch" wasn't seen as a duplicate of "Bring ranch on the side". Fix: subset match in dedupe.

A later run found that "table 1 needs two waters" read the quantity as 1, because the table number matched first. Fix: use the number attached to the item.

**How it was tested**
- `npm test` passes 35/35. That's 15 state tests plus 20 parser tests: all 6 AI scenarios through the fallback, edge cases, and validator rules such as an out-of-section table, an invented table, safety claims, a sold-out order, payment actions, enum whitelisting, caps and markup stripping.
- The type check is clean.
- End to end with `run-scenarios.mjs` against the dev server: all 8 scenarios match the expected results on the fallback path, and empty/too-long notes return 400 with friendly messages.
- The rate limit returns 429 after exactly 20 requests per minute.

**Pending:** the real AI path is untested because there's no `ANTHROPIC_API_KEY` in `.env` yet.

---

## Phase 3: Server view

*(not started)*
