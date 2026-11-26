// GET /api/health: which AI provider is active. Never returns a key.
// GET /api/health?models=1: the Gemini flash / flash-lite models this server's key
// can use (Google ListModels, a metadata call that uses no generation quota).
import { getProvider } from '../server/provider.js'
import { listGeminiModels } from '../server/providers/gemini.js'
import { clientIp, json, rateLimit, rateLimited } from '../server/http.js'

export async function GET(request?: Request): Promise<Response> {
  try {
    const p = getProvider()
    const base = { ok: true, aiConfigured: p.isConfigured(), provider: p.name, label: p.label, models: p.models }
    if (request && new URL(request.url).searchParams.get('models') === '1') {
      const limit = rateLimit(`models:${clientIp(request)}`, 5)
      if (!limit.ok) return rateLimited(limit.retryAfterSec)
      try {
        return json({ ...base, availableFlashModels: await listGeminiModels() })
      } catch (err) {
        return json({ ...base, availableFlashModels: null, error: err instanceof Error ? err.message : 'ListModels failed' })
      }
    }
    return json(base)
  } catch {
    return json({ ok: true, aiConfigured: false, provider: 'none' })
  }
}
