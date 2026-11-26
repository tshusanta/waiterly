import { useCallback, useEffect, useState } from 'react'
import { AiStatusBadge } from './components/Badge'
import { NAV_ITEMS, Nav, type View } from './components/Nav'
import { getHealth } from './lib/api'
import { useShift } from './state/useShift'
import { ServiceView } from './views/service/ServiceView'
import { SettingsView } from './views/SettingsView'

const VIEWS: View[] = ['service', 'stats', 'how', 'settings']
const viewFromHash = (): View => {
  const h = window.location.hash.slice(1) as View
  return VIEWS.includes(h) ? h : 'service'
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('tabletap.nav.collapsed') === '1'
  } catch {
    return false
  }
}

export default function App() {
  const shiftApi = useShift()
  const [view, setView] = useState<View>(viewFromHash)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // AI status: health check on load, then whatever the last real parse returned.
  const [aiMode, setAiMode] = useState<'ai' | 'fallback' | 'checking'>('checking')

  useEffect(() => {
    getHealth().then((h) => setAiMode((m) => (m === 'checking' ? (h.aiConfigured ? 'ai' : 'fallback') : m)))
  }, [])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((v: View) => {
    window.history.pushState(null, '', `#${v}`)
    setView(v)
    window.scrollTo(0, 0)
  }, [])

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('tabletap.nav.collapsed', c ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !c
    })

  const title = NAV_ITEMS.find((n) => n.id === view)!.label

  return (
    <div className={`app ${collapsed ? 'app-collapsed' : ''}`}>
      <Nav view={view} onNavigate={navigate} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <main className="main" id="main">
        <header className="page-head">
          <div>
            <h1>{title}</h1>
            <p className="muted">
              Juniper &amp; Pine · Section <span className="mono">{shiftApi.settings.assignedTables.join(', ')}</span>
            </p>
          </div>
          <AiStatusBadge mode={aiMode} />
        </header>

        {view === 'service' && <ServiceView shiftApi={shiftApi} onParsed={setAiMode} />}
        {view === 'settings' && <SettingsView shiftApi={shiftApi} />}
        {(view === 'stats' || view === 'how') && (
          <section className="card">
            <p className="muted">
              {view === 'stats' ? 'Floor stats is built in Phase 4.' : 'How it works is built in Phase 5.'}
            </p>
          </section>
        )}

        <footer className="footer muted small">
          Synthetic demo data. No real guests, names or payments. Your shift is saved in this browser only.
        </footer>
      </main>
    </div>
  )
}
