// GET /api/health: tells the UI whether AI is configured. Never returns the key.
import { aiConfigured } from '../server/ai.js'
import { json } from '../server/http.js'

export function GET(): Response {
  return json({ ok: true, aiConfigured: aiConfigured() })
}
