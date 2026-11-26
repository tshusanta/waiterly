import { ChartBar, ConciergeBell, Info, PanelLeftClose, PanelLeftOpen, Settings as SettingsIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type View = 'service' | 'stats' | 'how' | 'settings'

export const NAV_ITEMS: { id: View; label: string; icon: LucideIcon }[] = [
  { id: 'service', label: 'Service', icon: ConciergeBell },
  { id: 'stats', label: 'Floor stats', icon: ChartBar },
  { id: 'how', label: 'How it works', icon: Info },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

interface Props {
  view: View
  onNavigate: (v: View) => void
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Desktop: collapsible left sidebar (240 / 64 px). Phones: bottom tab bar (same markup, CSS switches). */
export function Nav({ view, onNavigate, collapsed, onToggleCollapsed }: Props) {
  return (
    <nav className={`nav ${collapsed ? 'nav-collapsed' : ''}`} aria-label="Main">
      <div className="nav-brand">
        <span className="nav-logo" aria-hidden="true">TT</span>
        <span className="nav-brand-text">
          <strong>TableTap</strong>
          <span>Juniper &amp; Pine</span>
        </span>
      </div>
      <ul className="nav-list">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="nav-item"
              aria-current={view === id ? 'page' : undefined}
              title={collapsed ? label : undefined}
              onClick={(e) => {
                e.preventDefault()
                onNavigate(id)
              }}
            >
              <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
              <span className="nav-label">{label}</span>
            </a>
          </li>
        ))}
      </ul>
      <button
        className="nav-collapse btn-icon"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <PanelLeftOpen size={20} strokeWidth={1.5} aria-hidden="true" />
        ) : (
          <PanelLeftClose size={20} strokeWidth={1.5} aria-hidden="true" />
        )}
      </button>
    </nav>
  )
}
