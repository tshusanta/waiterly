import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { apiDevPlugin } from './vite-plugin-api.ts'

export default defineConfig(({ mode }) => {
  // Load .env for the local /api handlers only. No VITE_ prefix, so the key
  // is never bundled into browser code.
  const env = loadEnv(mode, process.cwd(), '')
  if (env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY
  }
  return {
    plugins: [react(), apiDevPlugin()],
  }
})
