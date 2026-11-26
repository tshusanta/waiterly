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

## Phase 6: Testing

*(not started)*
