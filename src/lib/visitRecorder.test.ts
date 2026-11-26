import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpeechRecognitionLike } from './speech'
import { VISIT_CAP_MS, VISIT_SILENCE_MS, startVisitRecorder, type VisitEndReason } from './visitRecorder'

// A fake Web Speech recognizer we can drive from the test.
class FakeRecognition implements SpeechRecognitionLike {
  static instances: FakeRecognition[] = []
  lang = ''
  interimResults = false
  continuous = false
  started = false
  onresult: SpeechRecognitionLike['onresult'] = null
  onend: SpeechRecognitionLike['onend'] = null
  onerror: SpeechRecognitionLike['onerror'] = null
  private results: { transcript: string; isFinal: boolean }[] = []
  constructor() {
    FakeRecognition.instances.push(this)
  }
  start() {
    this.started = true
  }
  stop() {
    // Like Chrome: deliver what's pending, then end.
    queueMicrotask(() => this.end())
  }
  say(transcript: string, isFinal: boolean) {
    const last = this.results[this.results.length - 1]
    if (last && !last.isFinal) this.results[this.results.length - 1] = { transcript, isFinal }
    else this.results.push({ transcript, isFinal })
    const index = this.results.length - 1
    const results = this.results.map((r) => Object.assign([{ transcript: r.transcript }], { isFinal: r.isFinal }))
    this.onresult?.({ results, resultIndex: index })
  }
  end() {
    this.onend?.()
  }
  fail(error: string) {
    this.onerror?.({ error })
  }
}
const current = () => FakeRecognition.instances[FakeRecognition.instances.length - 1]

function record() {
  const updates: string[] = []
  const ended: { reason: VisitEndReason; transcript: string; error?: string }[] = []
  const rec = startVisitRecorder({
    Recognition: FakeRecognition,
    onUpdate: (f, i) => updates.push([f, i].filter(Boolean).join(' | ')),
    onEnd: (reason, transcript, error) => ended.push({ reason, transcript, error }),
  })
  return { rec, updates, ended }
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeRecognition.instances = []
})
afterEach(() => vi.useRealTimers())

describe('visit recorder', () => {
  it('uses continuous recognition with interim results and shows a live transcript', () => {
    const { updates } = record()
    expect(current()).toMatchObject({ continuous: true, interimResults: true, started: true, lang: 'en-US' })
    current().say('two wat', false)
    current().say('two waters', true)
    expect(updates).toEqual(['two wat', 'two waters'])
  })

  it('a speech-recognition restart mid-visit keeps appending, and never loses interim text', async () => {
    const { rec, ended } = record()
    current().say('two waters and', true)
    current().say('a side of', false) // not final yet...
    current().end() // ...when Chrome ends recognition on its own
    expect(FakeRecognition.instances).toHaveLength(2) // restarted automatically
    expect(rec.restarts).toBe(1)
    current().say('ranch please', true)
    rec.stop()
    await vi.runAllTimersAsync()
    expect(ended).toEqual([{ reason: 'stopped', transcript: 'two waters and a side of ranch please', error: undefined }])
  })

  it('ends after 20 seconds of silence, and any speech resets the timer', async () => {
    const { ended } = record()
    await vi.advanceTimersByTimeAsync(VISIT_SILENCE_MS - 1_000)
    current().say('one Coke', true)
    await vi.advanceTimersByTimeAsync(VISIT_SILENCE_MS - 1_000)
    expect(ended).toEqual([])
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.runAllTimersAsync()
    expect(ended[0]).toMatchObject({ reason: 'silence', transcript: 'one Coke' })
  })

  it('stops at the 10-minute safety cap even while people keep talking', async () => {
    const { ended } = record()
    for (let t = 0; t < VISIT_CAP_MS; t += 10_000) {
      current().say(`item ${t / 10_000}`, true)
      await vi.advanceTimersByTimeAsync(10_000)
    }
    await vi.runAllTimersAsync()
    expect(ended).toHaveLength(1)
    expect(ended[0].reason).toBe('cap')
  })

  it('a blocked microphone ends the visit with a clear message (the UI then offers typing)', () => {
    const { ended } = record()
    current().fail('not-allowed')
    expect(ended[0]).toMatchObject({ reason: 'error', transcript: '' })
    expect(ended[0].error).toMatch(/Microphone is blocked/)
  })

  it('"no-speech" from Chrome is not fatal: it just restarts', () => {
    const { ended } = record()
    current().fail('no-speech')
    current().end()
    expect(ended).toEqual([])
    expect(FakeRecognition.instances).toHaveLength(2)
  })

  it('gives up (keeping the text) if recognition keeps dying instantly', () => {
    const { ended } = record()
    current().say('two waters', true)
    for (let i = 0; i < 10; i++) current().end()
    expect(ended[0]).toMatchObject({ reason: 'error', transcript: 'two waters' })
  })

  it('only handles text: the recorder has no audio APIs to call', async () => {
    const src = (await import('./visitRecorder?raw')).default as string
    expect(src).not.toMatch(/MediaRecorder|getUserMedia|AudioContext|localStorage/)
  })
})
