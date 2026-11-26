// ─────────────────────────────────────────────────────────────────────────────
// AI PROVIDER SWAP POINT. This is the only file to change to use a different
// AI vendor. Write a new file in ./providers/ that implements AiProvider, then
// point `provider` at it. Prompts, validation, fallback and the UI stay as they are.
// ─────────────────────────────────────────────────────────────────────────────
import { anthropicProvider } from './providers/anthropic.js'
import type { AiProvider } from './providers/types.js'

export const provider: AiProvider = anthropicProvider

export { AiUnavailableError } from './providers/types.js'
