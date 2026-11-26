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

## Phase 2: AI parsing endpoint

*(not started)*
