// Minimal typing for the Web Speech API (not in TypeScript's DOM lib).
export interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> ; resultIndex: number }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
}

type Ctor = new () => SpeechRecognitionLike

/** The browser's speech recognizer, or null where unsupported (e.g. Firefox). */
export function getSpeechRecognition(): Ctor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
