import { AiUnavailableError } from './providers/types.js'

export function isNotConfigured(err: unknown): boolean {
  return err instanceof AiUnavailableError && /not set/.test(err.message)
}

/** Plain-language reason shown to the server when the fallback ran. */
export function fallbackNotice(err: unknown, fallbackName: string): string {
  if (isNotConfigured(err)) {
    return `AI is not configured on this server. Used the ${fallbackName} instead. Double-check each task.`
  }
  if (err instanceof Error && /timed? ?out|timeout/i.test(err.name + err.message)) {
    return `AI took too long to answer. Used the ${fallbackName} instead. Double-check each task.`
  }
  return `AI is unavailable right now. Used the ${fallbackName} instead. Double-check each task.`
}

export function logAiFailure(route: string, err: unknown): void {
  if (isNotConfigured(err)) return // expected in FALLBACK MODE, not an error
  console.error(`[${route}] AI failed, using fallback:`, err instanceof Error ? `${err.name}: ${err.message}` : err)
}
