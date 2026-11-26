import { useCallback, useEffect, useRef, useState } from 'react'
import { AiStatusBadge } from './components/Badge'
import { NAV_ITEMS, Nav, type View } from './components/Nav'
import { getHealth, type Health } from './lib/api'
import { newlyOverdue, overdueCount, tabTitle } from './lib/overdue'
import { useNow } from './lib/time'
import { openTasks } from './state/shift'
import { useShift } from './state/useShift'
import { ServiceView } from './views/service/ServiceView'
import { SettingsView } from './views/SettingsView'
import { StatsView } from './views/stats/StatsView'
import { HowView } from './views/HowView'

const VIEWS: View[] = ['service', 'stats', 'how', 'settings']
const viewFromHash = (): View => {
  const h = window.location.hash.slice(1) as View
  return VIEWS.includes(h) ? h : 'service'
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('waiterly.nav.collapsed') === '1'
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
  // A scenario picked on "How it works", loaded into the capture box.
  const [prefill, setPrefill] = useState<{ note: string; id: number } | null>(null)
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    getHealth().then((h) => {
      setHealth(h)
      setAiMode((m) => (m === 'checking' ? (h.aiConfigured ? 'ai' : 'fallback') : m))
    })
  }, [])

  // Overdue alerts on every view: "(2) Waiterly" in the tab title, and one short
  // vibration (where supported) when a task first passes 5 minutes.
  const now = useNow(15_000)
  const open = openTasks(shiftApi.shift)
  const overdue = overdueCount(open, now)
  const seenOverdue = useRef<Set<string> | null>(null)
  useEffect(() => {
    document.title = tabTitle(overdue)
  }, [overdue])
  useEffect(() => {
    const first = seenOverdue.current === null
    seenOverdue.current ??= new Set()
    const fresh = newlyOverdue(open, now, seenOverdue.current, first)
    if (fresh.length && typeof navigator.vibrate === 'function') navigator.vibrate(200)
  }, [open, now])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((v: View) => {
    window.history.pushState(null, '', `#${v}`)
    setView(v)
    setPrefill(null)
    window.scrollTo(0, 0)
  }, [])

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem('waiterly.nav.collapsed', c ? '0' : '1')
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

        {view === 'service' && <ServiceView shiftApi={shiftApi} onParsed={setAiMode} prefill={prefill} />}
        {view === 'stats' && <StatsView shiftApi={shiftApi} aiConfigured={health?.aiConfigured ?? null} />}
        {view === 'settings' && <SettingsView shiftApi={shiftApi} />}
        {view === 'how' && (
          <HowView
            aiMode={aiMode}
            health={health}
            onTryScenario={(note) => {
              navigate('service')
              setPrefill({ note, id: Date.now() }) // after navigate, which clears it
            }}
          />
        )}

        <footer className="footer muted small">
          Synthetic demo data. No real guests, names or payments. Your shift is saved in this browser only.
        </footer>
      </main>
    </div>
  )
}
