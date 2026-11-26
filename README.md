# Waiterly

A tool for restaurant servers. Tap a quick button, talk through a table visit, or type a messy note ("1 needs two waters, 4 wants ranch, 7 ready for the check split three ways") and Waiterly turns it into prioritized, per-table tasks that the server approves before they go live. A manager view shows wait times, request patterns, every safeguard that fired, and a shift summary.

Built for CIS 3100, Application of Generative AI. All data is synthetic.

**Live demo: https://waiterly.vercel.app**. Open it in any browser, with no sign-in. Each visitor gets their own sample shift.

> **Current mode: AI ONLINE, using Gemini `gemini-3.5-flash-lite` (Google free tier, chosen with the `GEMINI_MODEL` setting in Vercel, minimal thinking for speed).** Notes, trip plans and the manager summary are handled by Gemini. Every answer is checked by server-side code, and every task is approved by the server.
>
> If Gemini is overloaded, slow (over 15 s) or past its **20-requests-per-day free limit**, the app automatically switches to its built-in fallback (keyword parser, rule-based planner, stats summary). The badge then shows **FALLBACK MODE**, so a tester always sees which one answered.
>
> Real-AI test results are in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md) §3. To change or add a key, see [docs/ADD_API_KEY_LATER.md](docs/ADD_API_KEY_LATER.md).

## Try it in 30 seconds

1. On **Service**, tap a quick button on a table card (for example **Water**). It's added at once, with a 5-second Undo.
2. Tap the **mic on a table card** (or **Start visit** at the bottom) and talk through a visit, for example "two waters, actually make it three, and a Coke no ice". Tap **Stop**. No mic support? A text box opens instead.
3. Or tap a **Test scenarios** chip (for example *Allergy*), then **Organize with AI**.
4. Check the tasks on **Check before adding**. **Send ready items (N)** sends the clear ones at once. Anything unclear waits under **Needs you** with one-tap fixes: a table button, Replace/Remove for a sold-out item, or the guest's vs. the read-back version. Each one is sent as soon as it's fixed. One problem item never blocks the rest. **Copy for POS** copies one clean line of what was sent.
5. Check tasks off on the table cards (overdue ones rise to the top, and the tab title shows the count), or tap **Plan my next trips**.
6. Open **Floor stats** for KPIs, charts, the safeguard log and the shift summary.
7. **How it works** lists the exact AI rules, every safeguard and the test scenarios.

## Run locally

```bash
npm install
cp .env.example .env   # optional: add ANTHROPIC_API_KEY or GEMINI_API_KEY
npm run dev            # http://localhost:5173 (the /api routes run locally too)
npm test               # 205 unit + integration tests (AI calls mocked)
node scripts/run-scenarios.mjs http://localhost:5173   # spec scenarios with PASS/FAIL
```

## Stack

React + Vite + TypeScript, plain CSS, Lucide icons and Vercel serverless functions. AI is chosen by environment variable: Claude via `@anthropic-ai/sdk` (Haiku 5.5 / Sonnet 5.5), else Gemini 3.8 Flash via `@google/genai`, else a deterministic fallback. API keys stay server-side.

## Docs

- [BUILD_LOG.md](docs/BUILD_LOG.md): every phase, decision and fix, and who did what
- [TEST_RESULTS.md](docs/TEST_RESULTS.md): scenario inputs, expected and actual results
- [DESIGN_RULES.md](docs/DESIGN_RULES.md): the design rules the UI follows
- [ADD_API_KEY_LATER.md](docs/ADD_API_KEY_LATER.md): how to turn on, change or tune the AI
- [PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md): problem, solution, stack and architecture
- [AI_DESIGN.md](docs/AI_DESIGN.md): every prompt and schema word for word, validation, fallbacks
- [RISKS_AND_LIMITATIONS.md](docs/RISKS_AND_LIMITATIONS.md): risks, mitigations, human oversight, limitations
- [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md): the demo video walkthrough

**Version:** `v2-final` (feature freeze, 2026-11-26). `v1-stable` is the earlier rollback point, before the final feature update.
