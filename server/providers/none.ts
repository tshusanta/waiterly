// Used when no API key is set. Every call throws AiNotConfiguredError, which
// the endpoints turn into the deterministic fallback plus a clear message.
import { AiNotConfiguredError, type AiProvider } from './types.js'

const notConfigured = () => Promise.reject(new AiNotConfiguredError())

export const noneProvider: AiProvider = {
  name: 'none',
  label: 'None (no API key set)',
  models: { parse: 'keyword parser', plan: 'rule-based planner', summary: 'stats-based summary' },
  isConfigured: () => false,
  parseNote: notConfigured,
  planTrips: notConfigured,
  summarizeShift: notConfigured,
}
