import { describe, expect, it } from 'vitest'
import { getProvider } from './provider'
import { AiNotConfiguredError } from './providers/types'

describe('getProvider: chosen by environment variable', () => {
  it('uses Claude when ANTHROPIC_API_KEY is set (even if Gemini is too)', () => {
    expect(getProvider({ ANTHROPIC_API_KEY: 'a', GEMINI_API_KEY: 'g' }).name).toBe('anthropic')
  })

  it('uses Gemini when only GEMINI_API_KEY is set', () => {
    const p = getProvider({ GEMINI_API_KEY: 'g' })
    expect(p.name).toBe('gemini')
    expect(p.models.parse).toBe('gemini-2.5-flash')
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
