import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import type { DefenseModeOutletContext } from '../../app/defenseMode'
import { navigationItems } from '../../app/navigation'
import { appConfig } from '../../config/appConfig'
import { StatusBadge } from '../ui/StatusBadge'

const checkedAtFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function AppShell() {
  const [defenseMode, setDefenseMode] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem('sdn-defense-mode') === 'enabled'
  })
  const mainShellRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()
  const currentPage =
    navigationItems.find((item) => location.pathname.startsWith(item.path)) ??
    navigationItems[0]
  const outletContext: DefenseModeOutletContext = {
    defenseMode,
  }

  useEffect(() => {
    window.localStorage.setItem(
      'sdn-defense-mode',
      defenseMode ? 'enabled' : 'disabled',
    )
  }, [defenseMode])

  useEffect(() => {
    mainShellRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [location.pathname])

  return (
    <div className={`app-shell${defenseMode ? ' app-shell--defense' : ''}`}>
      <aside className="sidebar" aria-label="Primary navigation and environment details">
        <div className="brand-block">
          <div className="brand-mark">SDN</div>
          <div>
            <p className="brand-title">{appConfig.appName}</p>
            <p className="brand-subtitle">OpenDaylight, Mininet, and OVS telemetry</p>
          </div>
        </div>

        <div
          className="sidebar-scroll-region"
          tabIndex={0}
          aria-label="Primary navigation"
        >
          <nav className="sidebar-nav" aria-label="Primary">
            {navigationItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-link${isActive ? ' nav-link--active' : ''}`
                }
              >
                <span className="nav-link-label">{item.label}</span>
                <span className="nav-link-description">{item.description}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <span className="sidebar-footer-label">Backend target</span>
          <code className="mono">{appConfig.apiBaseUrl}</code>
        </div>
      </aside>

      <div ref={mainShellRef} className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Graduation project SDN console</p>
            <h1>{currentPage.label}</h1>
            <p className="topbar-description">{currentPage.description}</p>
          </div>

          <div className="topbar-meta">
            <div className="meta-card">
              <span>Platform</span>
              <strong>FastAPI + OpenDaylight</strong>
            </div>
            <div className="meta-card">
              <span>Checked</span>
              <strong>{checkedAtFormatter.format(new Date())}</strong>
            </div>
            <div className="meta-card meta-card--defense">
              <span>Presentation</span>
              <strong>{defenseMode ? 'Defense Mode' : 'Standard View'}</strong>
              <div className="meta-card-actions">
                <StatusBadge
                  label={
                    defenseMode ? 'Presenter Emphasis On' : 'Presenter Emphasis Off'
                  }
                  tone={defenseMode ? 'success' : 'neutral'}
                />
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setDefenseMode((current) => !current)}
                  aria-pressed={defenseMode}
                >
                  {defenseMode ? 'Disable Defense Mode' : 'Enable Defense Mode'}
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="content-shell">
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  )
}
