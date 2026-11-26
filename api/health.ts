// GET /api/health: which AI provider is active. Never returns a key.
import { getProvider } from '../server/provider.js'
import { json } from '../server/http.js'

export function GET(): Response {
  try {
    const p = getProvider()
    return json({ ok: true, aiConfigured: p.isConfigured(), provider: p.name, label: p.label, models: p.models })
  } catch {
    return json({ ok: true, aiConfigured: false, provider: 'none' })
  }
}
