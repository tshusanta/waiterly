// ─────────────────────────────────────────────────────────────────────────────
// AI PROVIDER SELECTION. This is the one file that decides which AI runs.
// It's chosen per request from environment variables, in this order:
//   1. ANTHROPIC_API_KEY set  →  Claude (Haiku 5.5 for parse/plan, Sonnet 5.5 for summary)
//   2. GEMINI_API_KEY set     →  Gemini 3.8 Flash
//   3. neither                →  no AI: keyword parser, rule-based planner, stats summary
// Adding a key in Vercel and redeploying switches the provider. No code change is needed.
// To add another vendor, write ./providers/<name>.ts implementing AiProvider and add it below.
// ─────────────────────────────────────────────────────────────────────────────
import { anthropicProvider } from './providers/anthropic.js'
import { geminiProvider } from './providers/gemini.js'
import { noneProvider } from './providers/none.js'
import type { AiProvider } from './providers/types.js'

export function getProvider(env: Record<string, string | undefined> = process.env): AiProvider {
  if (env.ANTHROPIC_API_KEY?.trim()) return anthropicProvider
  if (env.GEMINI_API_KEY?.trim()) return geminiProvider
  return noneProvider
}

export { AiNotConfiguredError, AiUnavailableError } from './providers/types.js'
