// Table-visit listening with the Web Speech API. No React, so it can be tested
// with a fake recognizer and fake timers.
//
// - continuous + interim results
// - ends on stop(), after 20 s of silence, or at a 10-minute safety cap
// - Chrome ends recognition on its own every so often (and after its own
//   silence timeout): we restart it and keep appending to the same transcript.
//   Interim text that hadn't been finalized when it ended is committed first,
//   so no words are lost on a restart.
// - Audio is never recorded or stored. Only the text transcript is kept, in memory.
import type { SpeechRecognitionLike } from './speech'

export type VisitEndReason = 'stopped' | 'silence' | 'cap' | 'error'

export interface VisitRecorderOptions {
  Recognition: new () => SpeechRecognitionLike
  onUpdate: (finalText: string, interim: string) => void
  onEnd: (reason: VisitEndReason, transcript: string, error?: string) => void
  silenceMs?: number
  capMs?: number
  lang?: string
}

export interface VisitRecorder {
  stop(): void
  /** How many times recognition was restarted mid-visit. */
  readonly restarts: number
}

/** Shown once, the first time the mic is used. */
export const MIC_NOTICE_TEXT =
  'Waiterly listens only during a visit you start, never stores audio, and keeps only the text of requests.'

export const VISIT_SILENCE_MS = 20_000
export const VISIT_CAP_MS = 10 * 60_000
const FATAL_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone is blocked. Allow mic access in your browser settings, or type the request.',
  'service-not-allowed': 'Speech recognition is turned off in this browser. Type the request instead.',
  'audio-capture': 'No microphone was found. Type the request instead.',
  'language-not-supported': 'Speech recognition does not support this language here. Type the request instead.',
}
// If recognition keeps dying immediately (e.g. offline), give up rather than spin.
const MAX_QUICK_RESTARTS = 8
const QUICK_WINDOW_MS = 10_000

const join = (a: string, b: string) => [a.trim(), b.trim()].filter(Boolean).join(' ')

export function startVisitRecorder(opts: VisitRecorderOptions): VisitRecorder {
  const silenceMs = opts.silenceMs ?? VISIT_SILENCE_MS
  const capMs = opts.capMs ?? VISIT_CAP_MS
  let finalText = ''
  let interim = ''
  let rec: SpeechRecognitionLike | null = null
  let stopping: VisitEndReason | null = null
  let ended = false
  let restarts = 0
  let restartTimes: number[] = []
  let silenceTimer: ReturnType<typeof setTimeout> | undefined
  let stopGuard: ReturnType<typeof setTimeout> | undefined
  const capTimer = setTimeout(() => requestStop('cap'), capMs)

  const emit = () => opts.onUpdate(finalText, interim)
  const commitInterim = () => {
    if (interim) {
      finalText = join(finalText, interim)
      interim = ''
    }
  }
  const resetSilence = () => {
    clearTimeout(silenceTimer)
    silenceTimer = setTimeout(() => requestStop('silence'), silenceMs)
  }

  function finish(reason: VisitEndReason, error?: string) {
    if (ended) return
    ended = true
    clearTimeout(silenceTimer)
    clearTimeout(capTimer)
    clearTimeout(stopGuard)
    commitInterim()
    if (rec) {
      rec.onresult = rec.onend = rec.onerror = null
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
    }
    emit()
    opts.onEnd(reason, finalText, error)
  }

  function requestStop(reason: VisitEndReason) {
    if (ended || stopping) return
    stopping = reason
    // stop() lets the recognizer deliver its last final result, then fire onend.
    try {
      rec?.stop()
    } catch {
      finish(reason)
      return
    }
    stopGuard = setTimeout(() => finish(reason), 1_500)
  }

  function begin() {
    if (ended) return
    const r = new opts.Recognition()
    r.lang = opts.lang ?? 'en-US'
    r.continuous = true
    r.interimResults = true
    r.onresult = (event) => {
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) finalText = join(finalText, text)
        else live = join(live, text)
      }
      interim = live
      resetSilence()
      emit()
    }
    r.onerror = (e) => {
      if (FATAL_ERRORS[e.error]) finish('error', FATAL_ERRORS[e.error])
      // no-speech, aborted, network: onend follows and we restart.
    }
    r.onend = () => {
      if (ended) return
      commitInterim()
      if (stopping) {
        finish(stopping)
        return
      }
      const now = Date.now()
      restartTimes = [...restartTimes.filter((t) => now - t < QUICK_WINDOW_MS), now]
      if (restartTimes.length > MAX_QUICK_RESTARTS) {
        finish('error', 'Speech recognition keeps stopping. What was heard so far is kept. Type the rest if needed.')
        return
      }
      restarts++
      emit()
      begin()
    }
    rec = r
    try {
      r.start()
    } catch {
      // Starting too soon after the last session ended can throw; try again shortly.
      setTimeout(() => {
        if (ended) return
        try {
          r.start()
        } catch {
          finish('error', 'Speech recognition could not restart. What was heard so far is kept.')
        }
      }, 300)
    }
  }

  resetSilence()
  begin()
  return {
    stop: () => requestStop('stopped'),
    get restarts() {
      return restarts
    },
  }
}
