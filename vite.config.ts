import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiDevPlugin } from './vite-plugin-api.ts'

export default defineConfig(({ mode }) => {
  // Load .env for the local /api handlers only. No VITE_ prefix, so the key
  // is never bundled into browser code.
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY']) {
    if (env[key] && !process.env[key]) process.env[key] = env[key]
  }
  return {
    plugins: [react(), apiDevPlugin()],
  }
})
