// Dev-only: serve /api/* from the same handler files Vercel deploys, so the app
// can be tested locally without `vercel dev` or a Vercel login.
import type { Plugin } from 'vite'

export function apiDevPlugin(): Plugin {
  return {
    name: 'tabletap-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const match = url.pathname.match(/^\/api\/([a-z-]+)$/)
        if (!match) return next()

        let mod: Record<string, unknown>
        try {
          mod = await server.ssrLoadModule(`/api/${match[1]}.ts`)
        } catch (err) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `No API route /api/${match[1]}` }))
          if (!/Failed to load url|does not exist/i.test(String(err))) console.error(err)
          return
        }

        const method = req.method ?? 'GET'
        const handler = mod[method]
        if (typeof handler !== 'function') {
          res.statusCode = 405
          res.end()
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v)
            else if (Array.isArray(v)) headers.set(k, v.join(', '))
          }
          const request = new Request(url, {
            method,
            headers,
            body: method === 'GET' || method === 'HEAD' || chunks.length === 0 ? undefined : Buffer.concat(chunks),
          })
          const response = (await (handler as (r: Request) => Promise<Response> | Response)(request)) as Response
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          console.error('[api-dev]', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Server error. Check the terminal running npm run dev.' }))
        }
      })
    },
  }
}
