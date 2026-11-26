import { AiNotConfiguredError } from './providers/types.js'

export function isNotConfigured(err: unknown): boolean {
  return err instanceof AiNotConfiguredError
}

/** Plain-language reason shown to the server when the fallback ran. */
export function fallbackNotice(err: unknown, fallbackName: string): string {
  if (isNotConfigured(err)) {
    return `AI is not configured on this server (no API key). Used the ${fallbackName} instead. Double-check each task.`
  }
  if (err instanceof Error && /timed? ?out|timeout|abort/i.test(err.name + err.message)) {
    return `AI took too long to answer. Used the ${fallbackName} instead. Double-check each task.`
  }
  return `AI is unavailable right now. Used the ${fallbackName} instead. Double-check each task.`
}

export function logAiFailure(route: string, err: unknown): void {
  if (isNotConfigured(err)) return // expected in FALLBACK MODE, not an error
  console.error(`[${route}] AI failed, using fallback:`, err instanceof Error ? `${err.name}: ${err.message}` : err)
}

export function logUnexpected(route: string, err: unknown): void {
  console.error(`[${route}] unexpected error, returned a safe response:`, err instanceof Error ? err.stack : err)
}
