import { describe, expect, it } from 'vitest'
import { getProvider } from './provider'
import { AiNotConfiguredError } from './providers/types'
import { ApiError } from '@google/genai'
import { geminiModel, isRetryable, thinkingFor } from './providers/gemini'

describe('getProvider: chosen by environment variable', () => {
  it('uses Claude when ANTHROPIC_API_KEY is set (even if Gemini is too)', () => {
    expect(getProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).name).toBe('anthropic')
  })

  it('uses Gemini when only GEMINI_API_KEY is set', () => {
    expect(getProvider({ GEMINI_API_KEY: 'g' }).name).toBe('gemini')
  })

  it('Gemini model defaults to gemini-3.8-flash and GEMINI_MODEL overrides it', () => {
    expect(geminiModel({})).toBe('gemini-3.8-flash')
    expect(geminiModel({ GEMINI_MODEL: ' gemini-x ' })).toBe('gemini-x')
  })

  it('retries only on Gemini overload (503) or a per-minute 429, not a daily quota, 504 or bad request', () => {
    const e = (status: number, message = 'x') => new ApiError({ message, status })
    expect(isRetryable(e(503))).toBe(true)
    expect(isRetryable(e(429, 'Quota exceeded: requests per minute'))).toBe(true)
    expect(isRetryable(e(429, 'Generate content requests per day limit exceeded on Free Tier'))).toBe(false)
    expect(isRetryable(e(504))).toBe(false)
    expect(isRetryable(e(400))).toBe(false)
    expect(isRetryable(new Error('503'))).toBe(false)
  })

  it('sends the right thinking setting for the model generation', () => {
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ thinkingBudget: 0 })
    expect(thinkingFor('gemini-3.8-flash')).toEqual({ thinkingLevel: 'LOW' })
  })

  it('uses no AI when neither is set, or the value is blank', () => {
    expect(getProvider({}).name).toBe('none')
    expect(getProvider({ ANTHROPIC_API_KEY: '  ', GEMINI_API_KEY: '' }).name).toBe('none')
  })

  it('the no-AI provider reports not configured and rejects with AiNotConfiguredError', async () => {
    const p = getProvider({})
    expect(p.isConfigured()).toBe(false)
    await expect(p.parseNote({ note: 'x', section: [1], openTasks: [] })).rejects.toBeInstanceOf(AiNotConfiguredError)
    await expect(p.summarizeShift({ stats: {} as never })).rejects.toBeInstanceOf(AiNotConfiguredError)
  })
})
