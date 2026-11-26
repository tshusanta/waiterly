import { useEffect, useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'

// Phase 0 shell: proves the frontend builds and can reach the /api folder.
export default function App() {
  const [api, setApi] = useState<'checking' | 'ok' | 'down'>('checking')

  useEffect(() => {
    fetch('/api/health')
      .then((r) => setApi(r.ok ? 'ok' : 'down'))
      .catch(() => setApi('down'))
  }, [])

  return (
    <main className="shell">
      <h1>
        <UtensilsCrossed size={20} strokeWidth={1.5} aria-hidden="true" /> TableTap
      </h1>
      <p className="muted">Juniper &amp; Pine · Section 1, 4, 7</p>
      <p className="muted">API: {api}</p>
    </main>
  )
}
