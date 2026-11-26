# Waiterly Build Log

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
- `npm run dev`: the server returns HTTP 200 with the Waiterly shell.
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
- Storage is versioned (`waiterly.shift.v1`). If the stored data is corrupt or missing, the app quietly reseeds instead of crashing.
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

## 2026-11-25: Decision, build Phase 3–6 in FALLBACK MODE (student)

**Decision (Student):** continue without an API key for now. Everything must keep working in FALLBACK MODE, and the AI provider must be swappable in one file. The student will add `ANTHROPIC_API_KEY` before Phase 7 (deploy).

**Consequences**
- Every AI feature (parse, plan, and the Phase 4 summary) has a deterministic fallback that is a real feature, not a stub.
- No mock or scripted "AI" responses were added. The spec forbids fake AI output, so without a key the UI honestly shows `FALLBACK MODE`.
- The real Claude path is still untested. It must be run against all scenarios as soon as the key is added, before or during Phase 7. This is tracked as an open item.

**Provider abstraction (Agent):**
- `server/providers/types.ts` defines `AiProvider` (`isConfigured`, `parseNote`, `planTrips`). Providers return raw JSON only.
- `server/providers/anthropic.ts` is the Claude implementation.
- **`server/provider.ts` is the single swap point**: one line, `export const provider = anthropicProvider`.
- Prompts (`server/prompt.ts`), validation (`shared/parse/validate.ts`, `shared/plan.ts`) and fallbacks are provider-independent. A new provider can't bypass the safeguards because its output goes through the same validators.
- The old `server/ai.ts` was removed, and `api/parse.ts`, `api/plan.ts` and `api/health.ts` now call `provider`.

---

## 2026-11-25: Phase 3, Server view (done, in FALLBACK MODE)

| Item | Who | Notes |
|---|---|---|
| App shell: collapsible sidebar (240 px, or a 64 px icon rail) that becomes a bottom tab bar under 768 px | Agent | Sections are Service, Floor stats, How it works and Settings. Hash routing keeps the view on refresh. The collapse state is remembered per browser. Floor stats and How it works are placeholders until Phases 4 and 5. |
| Quick capture | Agent | Labeled textarea with a live `n/600` counter. "Organize with AI" button and Ctrl/Cmd+Enter. A Web Speech mic button that is **hidden** where unsupported, with a clear error if the mic is blocked. 6 scenario chips. Empty notes are caught in the browser with no request sent. |
| AI status badge | Agent | `AI ONLINE` / `FALLBACK MODE`, taken from `/api/health` on load and then from the `source` of the last real parse. |
| Review card (human in the loop) | Agent | Nothing reaches the tables without approval. Each task has an editable table dropdown (section tables only), editable text and a remove button. Shows category, priority and flag badges, with the allergy note in red. Clarifications appear in amber with "Edit note", rejections in red with the reason, and skipped duplicates are listed. Buttons: "Add N tasks" and "Discard". Approved text is re-cleaned with the same `cleanTaskText` the server uses. |
| Table cards | Agent | Filter chips (All plus each table). Open tasks sorted by priority, then age. A round 44 px checkbox, a category pill, flag badges, a live wait time, and an amber `WAITING N MIN` badge at 5+ minutes (refreshed every 15 s). Completed tasks sit in a collapsed `<details>` list with done time, "took N min" and Undo. |
| Next move | Agent | A rule-based tip that updates live, in priority order: allergy, complaint, tables sharing a station ("Tables 1 and 4 both need drinks"), longest wait over 5 min, open check. "Plan my next trips" calls `POST /api/plan`. |
| `POST /api/plan` + `shared/plan.ts` | Agent | AI plan (Haiku, structured output) or a deterministic planner: allergies, then complaints, then checks, then longest waits, grouped by station, at most 3 trips. `validatePlan` keeps only real task ids, each used once, caps trips and re-sorts urgent trips first. Input is sanitized and rate-limited to 20/min per IP. |
| Settings | Agent | A section picker (tables 1–30, 44 px toggles, 1–8 tables). **Reset shift** goes through an in-app confirmation modal (Esc cancels, focus starts on Cancel and is trapped) and never uses `confirm()`. Plus an "About this demo" synthetic-data note. |
| Offline fallback in the browser (`src/lib/api.ts`) | Agent | If `/api` can't be reached at all, the same shared fallback parser or planner runs in the browser and says so. |
| Design system (`src/styles.css`) | Agent | Tokens from DESIGN_RULES.md. Self-hosted IBM Plex Sans and Mono (`@fontsource`, no external font requests). Uppercase mono status badges. 150 ms ease-out. `prefers-reduced-motion` respected. Light theme through `prefers-color-scheme`. |

**How it was tested** (Chrome automation against the dev server)
- **Desktop, 1376 px:**
  - The seed data renders on first load.
  - The Allergy chip, then Organize, gives a review card with "Check satay sauce for peanuts" (ALLERGY, HIGH, kitchen note) and "Bring lemon for water", with the FALLBACK PARSED badge and notice. Add 2 tasks puts both on Table 4.
  - "Plan my next trips" gives Trip 1 at the kitchen pass with both Table 4 allergy tasks, then Trip 2 at the POS for the Table 7 check.
  - Check-off moves a task to Completed and saves to localStorage. Undo restores it.
  - The approved allergy task appears in the safeguard log.
- **Phone, 375 px** (rendered in a 375 px iframe because the Chrome window wouldn't resize that small):
  - `scrollWidth` is 360, so there's no horizontal scroll.
  - The nav is fixed at the bottom.
  - Every interactive element is at least 44 px.
  - The Reset modal opens with focus on Cancel, and confirming reseeds 6 open + 6 done.
- **Keyboard:** an empty submit shows "Type or dictate a note first." with **0** API calls. Ctrl+Enter submits.
- **Contrast** (WCAG, computed from the tokens): every text/background pair passes AA in both themes. The lowest is red on a dark card at 5.29:1.
- **Forbid-list scan of `src/`:** no emoji, purple, indigo, violet, gradients, `#000000` or backdrop blur. The only `box-shadow` is on the modal, which is allowed.
- **Unit tests:** 42/42 pass, including 7 new planner tests. `npm run build` is clean.

**Problems and fixes**
1. Table cards in the same grid row stretched to equal height, leaving empty blocks. Fixed with `align-items: start`.
2. The "Trip 1" label ran into the trip title. Fixed with a flex gap.
3. The allergy note in the review card wasn't red. Fixed to match the table cards.
4. "took Just now" read badly. Fixed by adding `formatDuration` (`<1 min`).
5. The "All" chip was 42 px wide, under the 44 px target. Fixed with `min-width: 44px`.
6. "Section 1, 4, 7" wrapped mid-list on phones. Fixed with `nowrap`.
7. **Real bug found by a new unit test:** `validatePlan` blocked a task id reused across trips but not one repeated inside the same trip. Fixed.

**Open items**
- Live AI test once the key is added.
- Verify `.js` import resolution on Vercel (Phase 7).

---

## 2026-11-25: Phase 4, Manager view (done, in FALLBACK MODE)

| Item | Who | Notes |
|---|---|---|
| `shared/stats.ts`: `computeStats()` | Agent | Requests, completed, completion %, average minutes to complete, longest open wait and its table, safeguard counts from the log, open allergy tables, requests by table (open/completed) and by category. Pure function, unit-tested on the seed shift. |
| KPI row (5 tiles) | Agent | Requests this shift, Completed, Avg time to complete, Longest open wait, Safeguard flags. At most 3 data points per tile. 2-column grid on phones. |
| `HBarChart` (plain HTML) | Agent, following the dataviz skill | Built to the skill's mark specs: 20 px bars, 4 px rounded data-end, a 2 px surface gap between stacked segments, the total at the tip and no gridlines. A legend only for 2+ series. A hover/focus tooltip on each row, where the whole row is the hit target and is keyboard-focusable. Each row has an accessible label, and there's a "Show as table" view. |
| Chart colors | Agent | **Validated with the dataviz palette script.** Slate gray for "open" *failed* the chroma floor (it reads as no color), so it was swapped for a muted blue. The final pairs pass all 6 checks: dark `#10b981` / `#6b8fd6` on `#1e293b`, light `#047857` / `#4a72c4` on white. Emerald = completed (the healthy accent), blue = open. Amber and red stay reserved for status. |
| Safeguard log | Agent | Newest first, with time, uppercase badge (ALLERGY, 86'D, COMPLAINT, REJECTED, QUESTION), table and text. Scrolls after 420 px. |
| `POST /api/summary` + `shared/summary.ts` | Agent | The AI gets **computed stats only** (no task text, no guest details). Sonnet 5.5, structured output `{headline, insights[], action}`, effort low. **Anthropic server-side refusal fallback is on** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`), so a declined request is re-run on a fallback model. The student was told before Phase 4 and didn't object. Input stats are rebuilt from untrusted JSON, with numbers clamped and categories whitelisted. 10 requests/min per IP. |
| **Number-honesty check** | Agent, an added safeguard beyond the spec | Every number in the AI's headline, insights and action must appear in the stats it was given (plus 86, as in "86'd"). Lines with invented numbers are dropped, and a visible notice says how many. If nothing honest is left, the deterministic summary is used. |
| Deterministic summary | Agent | Written from the stats when AI is unavailable, and it passes the same number check. The action is "confirm the open allergy" when there is one, otherwise the longest wait. |

**Model choice:** the parse and plan calls stay on Haiku 5.5 (fast, cheap extraction). The summary uses Sonnet 5.5 as the spec asks, because it's prose a manager reads.

**How it was tested**
- **Unit tests:** 51/51 pass (+9). They cover stats on the seed shift (12 requests, 6 done, 50%, 4 min average, 7 min longest wait at T1, open allergy at T4) and the number check (a "35% faster" headline is replaced, a "19 min average" insight is dropped, all-invented output throws and falls back). Also: the fallback summary passes its own check, ties are reported as ties, and `readStats` drops unknown fields and categories.
- **Chrome, desktop:**
  - The KPIs show the right values.
  - Both charts render with the legend and the values at the tips.
  - Hovering Table 4 shows a "Completed 2 / Open 2" tooltip.
  - The safeguard log lists all 5 seed events.
  - "Write shift summary" gives a STATS-BASED badge and the plain-language FALLBACK notice.
- **Chrome, 375 px iframe:** `scrollWidth` 360, no overflow, 2-column KPI grid.
- The server type check passes with the beta `fallbacks` parameter, so the SDK accepts it.

**Problems and fixes**
1. Gray failed the palette's chroma check. Fixed by switching to a validated blue (see above).
2. **Honesty bug in the fallback summary:** "Table 1 is the busiest" when all tables were tied at 4. Fixed: ties are now stated as ties ("Requests are spread evenly: 4 requests per table"), with a unit test.
3. The safeguard breakdown left out questions, so the parts didn't add up to the total (1+1+1+1 ≠ 5). Fixed, with a unit test that the parts sum to the total.
4. The build shipped every font subset (Cyrillic, Greek, Vietnamese). Trimmed to the Latin subset, which took CSS from 27.6 to 18.7 kB with 5 font files instead of ~60.

**Open items (unchanged)**
- Live AI test once the key is added: parse, plan and summary, including a check that the summary's number filter doesn't over-drop real AI output.
- `.js` import resolution on Vercel.

---

## 2026-11-25: Phase 5, How it works (done)

| Item | Who | Notes |
|---|---|---|
| `shared/rules.ts`: single source for the 8 parse rules | Agent | **Decision:** the rules shown to the instructor must be *exactly* what the model gets. `server/prompt.ts` now builds its "Rules:" section from this list, and the page renders the same list, so they can't drift apart. A unit test asserts that every numbered rule appears verbatim in the system prompt. |
| The flow | Agent, steps from the spec | 5 numbered steps (a real sequence, so numbering is allowed by the design rules): guest asks, server captures, AI organizes, server reviews and completes, manager reviews. |
| AI rules + full system prompt | Agent | The 8 rules, plus a collapsible "Full system prompt" `<pre>` showing the real `PARSE_SYSTEM_PROMPT` for transparency. |
| Models | Agent | Haiku 5.5 for parse and plan, Sonnet 5.5 for the summary, what runs when AI is down, and the live AI status badge. |
| Restaurant context | Agent | Read from `shared/restaurant.ts`: name, 86'd items, free refills, allergy policy, menu. Marked SYNTHETIC. |
| Safeguards table | Agent | 10 rows covering all 9 spec safeguards plus the summary number check. Each row says *how* it works and *where* it's enforced (UI / Prompt + code / Code / Server / Design). |
| Test scenarios table | Agent | All 6 scenarios plus the empty/too-long edge case, with expected results. Each has a **Try it** button that loads the note into Service, ready to organize. |

**Decisions**
- The "Try it" prefill clears on any later navigation, so an old scenario never reappears in the capture box.
- I removed a pointless icon re-export file I had started. Icons are imported directly from `lucide-react`.

**How it was tested**
- **Unit tests:** 55/55 pass (+4 prompt tests). The prompt contains all 8 rules verbatim, plus the 86'd items and allergy policy. **No graded scenario is used as a few-shot example**, so the scenarios stay an honest test. The note is wrapped in `<note>` tags.
- **Chrome desktop:** all sections render, and the Complaint "Try it" opens Service with the note loaded. Going to Floor stats and back leaves the capture box empty.
- **Phone, 375 px:** every view (Service, Floor stats, How it works, Settings) measures `scrollWidth` 357, with no horizontal scroll. The wide tables scroll inside their own `overflow-x: auto` containers, as the design rules allow.
- **Code scan:** no `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere in `src/`, so all AI text renders as plain text.

**Problems and fixes**
- **Phone overflow bug:** How it works was 603 px wide at 375 px. Cause: a `.sr-only` table-header label is `position: absolute`, and its scroll container wasn't positioned, so the label escaped to about x = 600. Fixed with `.table-scroll { position: relative }`. This also fixes the same latent issue in the Floor stats "Show as table" caption.

---

## 2026-11-25: Product renamed to Waiterly (student decision)

**Decision (Student):** rename the product from "TableTap" to **Waiterly** everywhere. Lowercase `waiterly` is used for code identifiers and storage keys. This is the only place the old name is kept on purpose, as a record of the change. Earlier entries in this log were updated to the new name.

| Changed | Who | Notes |
|---|---|---|
| UI | Agent | Sidebar wordmark, logo mark ("TT" became "W", font size raised to 16 px for a single letter), Settings copy, rejection messages shown to servers. |
| `index.html` | Agent | `<title>Waiterly</title>`, plus a **new** `public/favicon.svg` (emerald "W" mark with `<title>` and `aria-label` "Waiterly"). The project had no favicon before, so there was no old alt text to rename. |
| AI prompts and rules | Agent | `server/prompt.ts` ("structured tasks for Waiterly"), `shared/rules.ts` rule 8, and the allergy policy in `shared/restaurant.ts`, which is also sent to the model. |
| Storage keys | Agent | `waiterly.shift.v1`, `waiterly.settings.v1`, `waiterly.nav.collapsed`. No migration was added because the app hasn't been deployed, so no tester has old data. Old keys left in the agent's own test browser were cleared. |
| Package | Agent | `package.json` name `waiterly`. `package-lock.json` was regenerated with `npm install --package-lock-only`, not hand-edited. |
| Docs and comments | Agent | `README.md`, `AGENT_PROMPT.md`, `docs/DESIGN_RULES.md`, `docs/BUILD_LOG.md`, the CSS header comment, and the dev plugin name `waiterly-api-dev`. |
| File and variable names | — | None contained the old name, so nothing to rename. |

**Verification**
- Case-insensitive repo search for `table[\s_-]?tap` (excluding `node_modules`, and after rebuilding `dist/`): no matches apart from this entry.
- File-name search: no matches.
- In the browser: title "Waiterly", the wordmark reads "Waiterly", `/favicon.svg` is served as `image/svg+xml`, and the page text has no old name.
- `npm test` passes 55/55, and `npm run build` is clean.
- **Note:** earlier git commits still contain the old name. History was not rewritten, which would need a force-push and isn't worth the risk.

---

## 2026-11-25: Phase 6, Testing (fallback path done; real-AI run pending the key)

| Item | Who | Notes |
|---|---|---|
| `api/api.test.ts`: endpoint integration tests | Agent | **Decision:** without a key, the honest way to test the AI path is to call the real handlers with a **fake provider that misbehaves on purpose** (out-of-section table, payment action, invented table, "it's safe" allergy claim, `<script>`, 40 tasks, wrong JSON shape, timeout, ghost trip ids, invented summary numbers). This proves the safeguards are in code, not just in the prompt. It doesn't replace a real model run, and it isn't presented as one. |
| More fallback edge cases | Agent | `table four` / `#7` / `T1`, out-of-section word numbers, mixed injection, gluten-free with "check if", new unnamed party, "cold water". |
| `scripts/run-scenarios.mjs` with automatic checks | Agent | Each scenario now asserts the spec's expected outcome in code and prints PASS/FAIL with reasons. It saves the full JSON responses and exits non-zero on any failure. |
| `docs/TEST_RESULTS.md` | Agent | Each scenario's input, expected result, pasted actual output and PASS/FAIL. Plus the safeguard integration table, edge cases, every bug found and fixed (10), and known limitations. **The real-AI section is explicitly marked PENDING.** |
| `docs/test-output/fallback-local.json` | Agent | Raw responses from the fallback run. |

**Results:** `npm test` passes 76/76 (+21 this phase). The scenario script passes 8/8 on the fallback path over HTTP.

**Problem found:** `#7` wasn't recognised as a table, so "#7 needs straws" was **silently assigned to table 4** (carried from the previous clause). That's the fallback guessing a table. Fixed the regex, and a test now covers it. It's recorded in TEST_RESULTS as bug #10 and under limitations, because carry-forward is a heuristic and the review card is the backstop.

**Decision noted in TEST_RESULTS:** if a fallback note contains an injection attempt anywhere, the *whole* note is rejected, even the legitimate part. This is conservative by design.

**Still open:** the real Claude run of all scenarios, plus plan and summary (needs the key). Then the live-URL run in Phase 7.

---

## 2026-11-25: Decision, deploy in FALLBACK MODE with switchable AI providers (student)

**Decision (Student):** there's no API key yet, so deploy now in FALLBACK MODE. Requirements set by the student:
1. Everything works with no key: never a crash or a 500.
2. A visible FALLBACK MODE badge.
3. "AI summary needs an API key" on the manager summary.
4. The provider is chosen by environment variable: `ANTHROPIC_API_KEY` uses Claude, else `GEMINI_API_KEY` uses Gemini (`gemini-2.5-flash`, `@google/genai`), else the fallback.
5. Real-AI tests marked PENDING.
6. A click-by-click guide for adding a key later.

| Item | Who | Notes |
|---|---|---|
| `server/provider.ts`: `getProvider()` | Agent | Reads env vars **per request**: Anthropic, then Gemini, then none. Blank values count as unset. Replaces the old one-line constant swap, and is still the single place that decides. Adding a key in Vercel and redeploying switches AI with no code change. |
| `server/providers/gemini.ts` | Agent, provider requested by the student | `gemini-2.5-flash` with `responseMimeType: application/json` and `responseJsonSchema` (the **same** JSON schemas and prompts as Claude), `thinkingBudget: 0` for speed, and a 15 s timeout (`AbortSignal.timeout` + `httpOptions.timeout`). Treats any finish reason other than `STOP` as a failure. SDK field names were checked against the installed `@google/genai` 3.6.1 type definitions, not guessed. |
| `server/providers/none.ts` + `AiNotConfiguredError` | Agent | With no key, every call throws a dedicated error. The endpoints use it to tell "no key" (`reason: "not_configured"`) apart from "AI failed" (`reason: "ai_error"`), so the UI shows the right message. |
| Never-500 safety net | Agent | Each endpoint's handler is wrapped. Even an unexpected bug, including inside the fallback code, returns HTTP 200 with a safe, readable response ("Nothing was added…") and logs the stack on the server. Proven by a test that deliberately breaks the fallback parser. |
| "AI summary needs an API key" | Agent | `/api/summary` returns that notice when no key is set. The Floor stats summary card shows an amber **AI summary needs an API key** callout *before and after* clicking (it knows from `/api/health`). The button reads "Write stats-based summary", and the summary is still produced from real numbers. |
| FALLBACK MODE badge | Agent (existing) | Shown in every page header. `/api/health` now has a 6 s timeout, so the badge can never get stuck on "CHECKING AI". |
| How it works → Models | Agent | Shows the provider active *right now* (from `/api/health`) and explains the env-var selection. |
| `.env.example` | Agent | Both `ANTHROPIC_API_KEY=` and `GEMINI_API_KEY=`, with the selection order explained. Vite dev loads both server-side only. |
| `docs/ADD_API_KEY_LATER.md` | Agent | Click-by-click: get a key (Anthropic console or Google AI Studio), add it in Vercel → Settings → Environment Variables, redeploy from Deployments → ⋯ → Redeploy, verify with `/api/health` and the badge, record results with the scenario script, and change, remove or rotate a key. It notes that Vercel only applies env vars to new deployments. |
| Endpoint tests moved `api/api.test.ts` → `tests/api.test.ts` | Agent | **Found during deploy prep:** Vercel deploys every file in `api/` as a public function, so the test file would have become a live endpoint (`/api/api.test`). |

**Rename check (requested):** a case-insensitive repo search for `table[\s_-]?tap` (excluding `node_modules`) finds only the intentional record in this log's rename entry. Details are in the Phase 7 entry.

**How it was tested:** `npm test` passes 82/82 (+6). The new tests cover:
- provider selection (Anthropic over Gemini over none, blank equals unset);
- no-key parse returning 200 + `not_configured`;
- no-key summary returning "AI summary needs an API key";
- AI-error summary returning "unavailable";
- a deliberately broken fallback still returning 200;
- health never exposing a key.

`tsc` is clean, including the Gemini provider against the real SDK types.

**Not tested (no keys):** any real Claude or Gemini call. TEST_RESULTS Section 3 is PENDING for both.

---

## 2026-11-25: Phase 7, Deploy (done, in FALLBACK MODE)

**Live URL: https://waiterly.vercel.app**. Vercel project `waiterly`, team `sushant-52c2`. Code at https://github.com/tshusanta/waiterly.

| Step | Who | Notes |
|---|---|---|
| Install Git and Node | Agent (winget, Phase 0) | — |
| `git push -u origin main` | **Student** | The agent's shell and Claude Code's `!` shell are non-interactive, so neither can show GitHub's sign-in. The student pushed from their own PowerShell window, signing in through the browser. |
| `vercel login` | **Student** | The first attempt didn't finish (no auth token was saved). The student logged in again from their own terminal as `tshusanta`. |
| `vercel link --yes --project waiterly` | Agent | Created and linked the project. The CLI also wrote `.env.local` (a Vercel OIDC token) and appended `.env*` to `.gitignore` **after** `!.env.example`, which would have started ignoring the template. Rewrote `.gitignore` so `.env*` comes first and `!.env.example` last. Verified with `git check-ignore` that `.env`, `.env.local` and `.vercel` are ignored and `.env.example` isn't. The agent didn't open `.env.local`. |
| `vercel --prod --yes` | Agent | Deployed to production. No environment variables are set, so it runs in FALLBACK MODE by design. |
| GitHub ↔ Vercel connection | Agent tried, **needs the student** | `vercel link` and `vercel git connect` both returned "Failed to connect tshusanta/waiterly". The Vercel GitHub App needs repo access, which must be granted in the browser. Steps are in `docs/ADD_API_KEY_LATER.md` → "Connecting GitHub for automatic deploys". Until then, deploys run with `npx vercel --prod`. |

**How it was tested (live)**
- **No sign-in:** `GET /` returns 200 with no cookies or credentials. The deployment-specific URL returns 302 to a Vercel login (Deployment Protection), so only the production domain is shared.
- **Scenarios:** all 8 pass on the live URL (`docs/test-output/fallback-live.json`), at 56–278 ms each.
- **Endpoints:** `/api/health`, `/api/plan` and `/api/summary` all return 200 with `reason: not_configured`. The summary has the exact text "AI summary needs an API key…". Bad input gets 400, an unknown route gets 404, and nothing returns 500.
- **Phase 2 risk closed:** server code importing `../shared/*.js` and `../server/*.js` loads correctly on Vercel's Node runtime.
- **Browser, desktop:** the full flow works (scenario → review → add → plan → summary), with 0 console errors.
- **Browser, 375 px:** no horizontal scroll on any view, the badge is visible on each, and tap targets are at least 44 px.
- **Not done by the agent:** a click-through in a true incognito window (the automation tool can't open one), and any test with a real AI key (none exists).

**Remaining before submission (student)**
1. Connect GitHub in the Vercel dashboard (optional but recommended).
2. Do a final private-window click-through on desktop and phone.
3. If a key is obtained: follow ADD_API_KEY_LATER.md and replace the PENDING rows in TEST_RESULTS Section 3 with real output.

---

## 2026-11-25: Phase 8, Documentation and final review (done)

| Item | Who | Notes |
|---|---|---|
| `docs/PROJECT_SUMMARY.md` | Agent | Problem, solution, users and value, the tech stack with *why* for each tool, a Mermaid architecture diagram (every path goes through the same validators and then the server's approval), the repo layout, the live URL and how to run it locally. Marked FALLBACK MODE up front. |
| `docs/AI_DESIGN.md` | Agent | Where AI is and isn't used, the models and why, request settings for Claude and Gemini, **every prompt and schema word for word**, the validation layer step by step, the fallback logic and prompt-injection defence by layer. **Decision:** the prompts section is *generated* from `server/prompt.ts` by `npm run docs:prompts` (`scripts/build-ai-design.mjs`), and a unit test fails if the doc ever differs from the live prompts or schemas. |
| `docs/RISKS_AND_LIMITATIONS.md` | Agent | 9 risks, each with mitigations and the **risk that remains**: misread table, allergy errors, prompt injection, API cost or outage, privacy (including that Chrome dictation sends audio to the browser vendor), over-reliance, fallback limits, real-AI behaviour not yet measured, data loss. Plus a diagram and table of where human oversight sits ([0] code checks, [1] server review, [2] completion, [3] manager review), and prototype limitations. |
| `docs/DEMO_SCRIPT.md` | Agent | About 4 minutes, timed. Scenarios: Allergy, Unclear table, Prompt injection, plus trips, completion, manager view and How it works. It has *[Fallback]* and *[AI]* versions of each AI line so the narration matches whichever badge is on screen. |
| Demo trip plan pinned by a test | Agent | **Caught while writing the script:** a draft line claimed "one drink run for two tables", which is wrong for the seed shift plus the Allergy scenario. Rewrote it to describe what the planner always does, and added a unit test that the demo path gives "Kitchen pass: Table 4" then "POS: Table 7". |
| `npm run scenarios`, `npm run docs:prompts` | Agent | Convenience scripts. |
| **Final forbid-list review** (spec §7) | Agent | On the **live site**, all 4 views were checked with details panels, the summary and the Reset modal opened. An automated computed-style scan found: no emoji, no gradients, no purple or pink surfaces, no backdrop blur, no shadows except the modal, no animation except the loading spinner, no centred headings, no left accent stripes, no pure `#000`, no transitions over 150 ms, and every text node in IBM Plex. A visual check of How it works (safeguards table) and Settings followed. **No issues found, so no fixes were needed.** |

**How it was tested:** `npm test` passes 84/84 (+2: the doc-drift guard and the demo path). The prompts section was regenerated and verified by test.

---

## AI use statement summary (for the course's required statement)

**Built by:** Claude Code (an AI coding agent, model Claude Opus 5.5), directed by the student over one session on 2026-11-25.

| Area | Student | AI agent |
|---|---|---|
| Product idea, problem, requirements | **Wrote the full spec** (`AGENT_PROMPT.md`): problem, stack, phases, AI rules, safeguards, test scenarios, design rules | Summarized it back for confirmation before starting |
| Key decisions | Install tools via winget. Continue without an API key. Make the provider swappable, then switchable by env var with Gemini as a second option. **Rename TableTap → Waiterly.** Deploy in FALLBACK MODE now. Use Vercel CLI login. Connect GitHub. **Add a Gemini key (2026-11-26). Approve switching to `gemini-3.8-flash`** when 2.5 was unavailable. List the UI fixes and the free-text fallback behaviour. | Proposed and explained options. Flagged trade-offs (for example, the Anthropic refusal fallback before using it). Chose implementation details within the spec. |
| Code | Reviewed status after every phase, and said "continue" or redirected | Wrote all code: React UI, API functions, prompts, validators, fallback parser and planner, stats, tests, scripts |
| Design | Set the design direction and forbid list (spec §4) | Did the web research for DESIGN_RULES.md. Chose fonts (IBM Plex) and the validated chart colours. Built the CSS. |
| Testing | Defined the 7 scenario rows and expected results | Wrote 84 automated tests and the scenario runner. Tested in Chrome at desktop and 375 px. Found and fixed 10 bugs (TEST_RESULTS §5). |
| Accounts and secrets | **Did all sign-ins personally:** GitHub push, Vercel login. Will add any API key themselves. | Never handled credentials. Kept keys server-side only. Fixed the `.gitignore` the Vercel CLI changed. Didn't open the CLI's token file. |
| Deployment | Owns the GitHub repo and Vercel account | Linked the project, deployed and tested the live URL |
| Docs | Required them in the spec | Wrote all docs in `docs/`, kept the build log every phase |

**What the student should verify personally before submitting:** a private-window click-through on desktop and phone, the GitHub ↔ Vercel connection (optional), and real-AI results if a key is added (TEST_RESULTS §3 is PENDING until then).

---

## 2026-11-26: UI fixes, free-text fallback, real AI live (Gemini)

**Student requests:**
1. Six UI fixes.
2. A fallback-parser change.
3. Redeploy with the `GEMINI_API_KEY` the student added to Vercel (production, sensitive; the agent never saw the value).
4. Run the real-AI tests and record them.
5. Update the docs.

| Item | Who | Notes |
|---|---|---|
| No "Add 0 tasks" | Agent, requested by the student | When nothing can be added, the review card shows only **Dismiss** |
| Rejected request and reason on separate lines | Agent, requested by the student | Request in small muted mono on the first line, reason below |
| Title Case category pills | Agent, requested by the student | `categoryLabel()` in `Badge.tsx` ("drinks" → "Drinks"), used on review rows and table cards |
| "FALLBACK PARSED" → "FALLBACK MODE" | Agent, requested by the student | Review card badge |
| Normal font for table headings | Agent, requested by the student | "Table 4" now uses Plex Sans 600 instead of mono |
| Even table/Completed layout | Agent, requested by the student | Completed is now the last item *in* the table grid: at most 2 even columns, rows stretch to equal height, and Completed spans the row if it would sit alone (`:nth-child(odd)`). A container query makes it 1 column under 560 px. Checked: 3 tables + Completed = an even 2×2, and 375 px stacks with no overflow. |
| Fallback: clear table + unknown item → task | Agent, requested by the student | `freeTextTask()`: "t1 needs chopped onions" → T1 "Bring chopped onions" (Other), "wants to move to a booth" → "Move to a booth". It carries the note "Written from your words, not a known item. Check it reads right." It still asks when there's no request, and still never guesses a table. +5 tests. |
| Redeploy + Gemini | Agent | `/api/health` gives `provider: gemini`. The first real call failed (see below). |

**Problems hit with the real AI, and fixes** (verbatim runs in `docs/test-output/gemini-live-2026-11-26.md`)
1. **`gemini-2.5-flash` returned 404** "no longer available to new users". The error text suggested `gemini-3.8-flash`. The agent **asked the student before acting on it**, because it was an instruction from an API response and the spec named 2.5. With the student's approval the default became `gemini-3.8-flash`, and a `GEMINI_MODEL` override was added. Thinking now uses `thinkingLevel` for 3.x models (`thinkingBudget: 0` only for 2.x).
2. **First real output:** a single complaint request returned `source: "ai"` with two high-priority complaint tasks for T7. This was the first real model output of the project.
3. **The scenario script overstated results.** Run 1 printed "10/10 passed", but 6 of those were fallback answers. The agent caught this before recording anything, added `--require-ai` (a fallback counts as FAIL), and reported only `ai` answers.
4. **Google overload:** 503 "high demand" and 504 deadline errors. Added one quick retry on 503 inside the 15 s budget. 504s can't be helped within the spec's ~15 s fallback limit.
5. **The agent's mistake:** it set thinking `MINIMAL` to cut latency, and the model rejected it with 400. Reverted to `LOW`, with a unit test.
6. **Free-tier quota:** `429` "requests per day limit exceeded", **limit 20** for this model. Daily-quota 429s are no longer retried, since a retry wastes a request. The remaining tests have to wait for the reset (about 3 h 45 m).
7. **Script bug:** `--json` overwrote earlier runs' raw output. It now adds a timestamp. The lost raw JSON is replaced by the verbatim console output.

**Results:** TEST_RESULTS §3.
- Real Gemini passes: **Dinner rush, Sold-out, Complaint, Prompt injection, Trip plan.** That's 5 of 5 real answers. No answer needed code-level correction, and **no prompt changes were needed**.
- **PENDING:** Allergy, Unclear table, Shift summary. Gemini never answered these (503/504, then the quota). The fallback handled all three correctly every time.

**Tests:** 91/91 pass (+7: free-text tasks, Gemini model default and override, thinking setting, retry policy).

**Not verified by the agent:** a screenshot of the live AI ONLINE badge, because the Chrome extension disconnected. The badge comes straight from `/api/health`, which reports `aiConfigured: true`.

**Docs updated:** README, PROJECT_SUMMARY, AI_DESIGN (status, model, request settings, regenerated prompts section), RISKS (risks 4, 7, 8 and limitations), ADD_API_KEY_LATER (current state, quota, `GEMINI_MODEL`), TEST_RESULTS, `.env.example` (`GEMINI_MODEL`), and How it works text in the app.

**To finish (student):** after the quota resets, run `node scripts/run-scenarios.mjs https://waiterly.vercel.app --require-ai --delay 7000 --json docs/test-output/gemini-live-run4.json` and paste the Allergy, Unclear table and Summary results into TEST_RESULTS §3. Consider enabling billing or adding an Anthropic key so the instructor's testing doesn't use up the 20-requests-per-day limit.

## 2026-11-26 (later): free-tier test rule, v1-stable tag, final feature update

**Student requests:**
1. Use the free Gemini tier only: at most **8 real-AI calls**, mock the rest, and leave quota for the demo recording.
2. Run the tests, commit, then **tag `v1-stable`** for rollback.
3. The final feature update: quick taps, table-visit voice mode, AI visit analysis, table rules in code, a verification card, overdue alerts, Copy for POS, docs and tests. No more features after this.

| Item | Who | Notes |
|---|---|---|
| Mocked-Gemini scenario suite | Agent | `tests/scenarios.mock.test.ts` mocks only `@google/genai`'s network call. The real handlers, Gemini provider code and validators run. The checks moved to `scripts/scenario-spec.mjs`, shared with the live runner, so a mocked PASS means the same as a live PASS. |
| AI call cap in the runner | Agent | `--max-ai-calls` defaults to **8 for any non-local URL**. `--only` picks scenarios. `--visits` adds the transcripts. Verified with `--max-ai-calls 0`, which spends nothing. |
| `v1-stable` | Agent, requested by the student | Tagged on `72ca08d` and pushed. Roll back with `git checkout v1-stable`, or redeploy that commit. |
| Quick-tap requests | Agent, from the student's spec | `shared/quickTap.ts`. Six 44 px buttons per card. Instant, no AI, no review, 5 s Undo toast (`removeTask`). Check is high. |
| Table visit voice mode (replaces the old dictation mic) | Agent, from the student's spec | `src/lib/visitRecorder.ts`: continuous + interim. Ends on Stop, 20 s silence or a 10 min cap. Auto-restarts when Chrome ends recognition, committing interim text first so none is lost. Fatal errors (blocked mic) switch to typing. Text only, no audio, nothing stored. Card mic = linked table, bottom mic = no table. Listening bar with table, timer, live transcript and Stop. A one-time notice (the student's wording). A text box where speech is unsupported. |
| AI analysis of the visit | Agent, from the student's spec | `/api/parse` with `mode: "visit"`. `VISIT_RULES` (7, shown on How it works and in the prompt) plus all 8 note rules. A new strict schema with `table_source`, `changes`, `mismatches` and `table_corrections`. Keeps the most recent 8,000 characters and says when the start was trimmed. Same never-500 safety net. |
| Table rules in code | Agent, from the student's spec | `shared/visit/tables.ts` (`spokenTables`, `resolveTable`, `chooseTable`) and `shared/visit/validate.ts`. Card / spoken / conflict / missing / outside, all enforced whatever the model says. |
| Verification card | Agent, from the student's spec | Replaces the review card for visits **and** typed notes. Final tasks first, section-only dropdown, Edit / Remove, What changed, mismatch choice. Confirm is gated (`readiness`) and says what's missing. |
| Overdue alerts | Agent, from the student's spec | Overdue first per table, "(N) Waiterly" tab title on every view, one `navigator.vibrate` when a task first becomes overdue (not for old tasks on load) |
| Copy for POS | Agent, from the student's spec | `shared/pos.ts`, on the verification card and allergy tasks, with a "Copied" confirmation |
| Docs | Agent | How it works (visit rules, table rules, quick taps, overdue, POS, mic privacy), AI_DESIGN (visit prompt and schema generated, plus §4.1b and the visit fallback), RISKS (rows 10–15: consent and recording laws, noise, browser support, no always-on mic, POS as system of record, quick taps), TEST_RESULTS §7, README, PROJECT_SUMMARY |

**Problems and fixes:**
1. **Retry bug (the agent's code, found in a live run):** after a 503 the server retried with about 9 s left, and Gemini rejects deadlines under 10 s with **400**. A retry now happens only if at least 10 s remain.
2. **Visits timed out:** live visit calls got **504 at 15 s**. Visits now get 25 s (the function limit is 30 s). One further try at 25 s also got 504, so this is **not proven fixed**.
3. **UI script findings:** two fast taps on the verification card used stale state, so it now uses functional updates. A card/spoken table conflict asked once per task, so one answer now resolves them all.
4. **Visit fallback turned small talk into a task.** The free-text rule is now off for transcripts.
5. **Test-harness issues (not app bugs):** the Chrome extension was disconnected again, so the agent drove headless Chrome over the DevTools protocol with a scripted speech recognizer. Re-navigating to the same `#hash` didn't reload the page, so it now goes through `about:blank`. A shell command that included a profile-folder cleanup was blocked by a safety check. The cleanup was removed, and nothing was deleted.

**Free-tier ledger:** 7 real Gemini calls of the 8 allowed (TEST_RESULTS §7.1), at least 13 left for the demo. **No real Gemini answer was obtained this round**: every call got a Google 503 or 504. Everything else was verified with mocked replies.

**Tests:** 188/188 (up from 111). UI: 59/59 headless checks locally at 375 and 1440 px, 31/31 on the live site.

**Not verified:** real-AI visit analysis, a real microphone or phone, and vibration on hardware. See TEST_RESULTS §7.3–7.4 for the command to finish the real-AI visit check.

## 2026-11-26 (evening): free-tier Gemini tuning

**Student request:** no paid API. Make the free Gemini tier as reliable as possible: list the available flash and flash-lite models, switch to the fastest flash-lite with minimal thinking through `GEMINI_MODEL`, shorten the visit prompt, redeploy, and run **one** real visit test. At most 3 real requests.

| Item | Who | Notes |
|---|---|---|
| ListModels | Agent | The key lives only in Vercel and the agent doesn't handle it, so a read-only `GET /api/health?models=1` calls Google's ListModels **server-side** and returns model names and limits only, never the key. It's a metadata call with no generation quota, rate limited to 5 a minute. Result: TEST_RESULTS §7.6. Google reports no free-tier rate limits there. |
| Model switch | Agent, requested by the student | `GEMINI_MODEL=gemini-3.5-flash-lite` (newest flash-lite) set with `vercel env add`. It's a model name, not a secret. `/api/health` confirms it. |
| Thinking | Agent | MINIMAL for 3.x flash-lite, off for 2.x, LOW otherwise. A `GEMINI_THINKING` override. A 400 "thinking" rejection retries once on LOW and is remembered. +3 tests. |
| Shorter visit prompt | Agent | 5,239 → 4,258 characters. All rules kept, and the existing prompt tests still check each rule and phrase. Redundant schema-enforced lists removed, plus a "leave note and changes empty" instruction to shorten output. AI_DESIGN regenerated. |
| Real visit test | Agent | **1 real request: AI answered in 5.1 s, PASS** (3.8-flash had hit 504 at 15 s and 25 s) |
| Arrow bug | Agent | The live answer showed "Iced tea - Coke": the sanitizer strips `>`. Arrows now become "→", with a test. |

**Tests:** 191/191.

