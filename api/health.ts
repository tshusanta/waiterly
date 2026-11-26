// GET /api/health: Phase 0 smoke test for the serverless folder.
// Reports whether the key is configured, never the key itself.
export function GET(): Response {
  return Response.json({
    ok: true,
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
  })
}
