# Waiterly

A tool for restaurant servers. Type or dictate a messy note ("1 needs two waters, 4 wants ranch, 7 ready for the check split three ways") and Waiterly turns it into prioritized, per-table tasks that the server approves before they go live. A manager view shows wait times, request patterns, every safeguard that fired, and a shift summary.

Built for CIS 3100, Application of Generative AI. All data is synthetic.

**Live demo: https://waiterly.vercel.app**. Open it in any browser, with no sign-in. Each visitor gets their own sample shift.

> **Current mode: FALLBACK MODE (no AI key set yet).** The app is fully usable. Notes are organized by a keyword parser, trips by a rule-based planner, and the manager summary is written from the real stats. The badge at the top right says so. Adding an `ANTHROPIC_API_KEY` (Claude) or `GEMINI_API_KEY` (Gemini) in Vercel switches on the AI with no code change. See [docs/ADD_API_KEY_LATER.md](docs/ADD_API_KEY_LATER.md).

## Try it in 30 seconds

1. On **Service**, tap a **Test scenarios** chip (for example *Allergy*), then **Organize with AI**.
2. Review the parsed tasks. Edit or remove any, then **Add N tasks**.
3. Check tasks off on the table cards, or tap **Plan my next trips**.
4. Open **Floor stats** for KPIs, charts, the safeguard log and the shift summary.
5. **How it works** lists the exact AI rules, every safeguard and the test scenarios.

## Run locally

```bash
npm install
cp .env.example .env   # optional: add ANTHROPIC_API_KEY or GEMINI_API_KEY
npm run dev            # http://localhost:5173 (the /api routes run locally too)
npm test               # 82 unit + integration tests
node scripts/run-scenarios.mjs http://localhost:5173   # spec scenarios with PASS/FAIL
```

## Stack

React + Vite + TypeScript, plain CSS, Lucide icons and Vercel serverless functions. AI is chosen by environment variable: Claude via `@anthropic-ai/sdk` (Haiku 5.5 / Sonnet 5.5), else Gemini 2.5 Flash via `@google/genai`, else a deterministic fallback. API keys stay server-side.

## Docs

- [BUILD_LOG.md](docs/BUILD_LOG.md): every phase, decision and fix, and who did what
- [TEST_RESULTS.md](docs/TEST_RESULTS.md): scenario inputs, expected and actual results
- [DESIGN_RULES.md](docs/DESIGN_RULES.md): the design rules the UI follows
- [ADD_API_KEY_LATER.md](docs/ADD_API_KEY_LATER.md): how to turn on the AI
