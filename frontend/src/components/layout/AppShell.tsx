import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { presenterHotkeyLabel } from '../../app/presenterDirector'
import type { DefenseModeOutletContext } from '../../app/defenseMode'
import { navigationItems } from '../../app/navigation'
import { appConfig } from '../../config/appConfig'
import { PresenterRail } from '../presenter/PresenterRail'
import { StatusBadge } from '../ui/StatusBadge'

const checkedAtFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function readStoredFlag(key: string) {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(key) === 'enabled'
}

export function AppShell() {
  const [defenseMode, setDefenseMode] = useState(() => {
    return readStoredFlag('sdn-defense-mode')
  })
  const [presenterMode, setPresenterMode] = useState(() => {
    return readStoredFlag('sdn-presenter-mode')
  })
  const [presenterRailOpen, setPresenterRailOpen] = useState(() => {
    return readStoredFlag('sdn-defense-mode') || readStoredFlag('sdn-presenter-rail-open')
  })
  const [spotlightMode, setSpotlightMode] = useState(() => {
    return readStoredFlag('sdn-presenter-spotlight')
  })
  const mainShellRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()
  const currentPage =
    navigationItems.find((item) => location.pathname.startsWith(item.path)) ??
    navigationItems[0]
  const outletContext: DefenseModeOutletContext = {
    defenseMode,
  }
  const presenterEnabled = defenseMode || presenterMode

  useEffect(() => {
    window.localStorage.setItem(
      'sdn-defense-mode',
      defenseMode ? 'enabled' : 'disabled',
    )
  }, [defenseMode])

  useEffect(() => {
    window.localStorage.setItem(
      'sdn-presenter-mode',
      presenterMode ? 'enabled' : 'disabled',
    )
  }, [presenterMode])

  useEffect(() => {
    window.localStorage.setItem(
      'sdn-presenter-rail-open',
      presenterRailOpen ? 'enabled' : 'disabled',
    )
  }, [presenterRailOpen])

  useEffect(() => {
    window.localStorage.setItem(
      'sdn-presenter-spotlight',
      spotlightMode ? 'enabled' : 'disabled',
    )
  }, [spotlightMode])

  useEffect(() => {
    mainShellRef.current?.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    })
  }, [location.pathname])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePresenterHotkey = (event: KeyboardEvent) => {
      if (!event.altKey || event.key.toLowerCase() !== 'p') {
        return
      }

      event.preventDefault()

      if (defenseMode) {
        setPresenterRailOpen((current) => !current)
        return
      }

      setPresenterMode((current) => {
        const nextValue = !current
        setPresenterRailOpen(nextValue)
        if (!nextValue) {
          setSpotlightMode(false)
        }

        return nextValue
      })
    }

    window.addEventListener('keydown', handlePresenterHotkey)

    return () => {
      window.removeEventListener('keydown', handlePresenterHotkey)
    }
  }, [defenseMode])

  function handleTogglePresenterMode() {
    setPresenterMode((current) => {
      const nextValue = !current
      setPresenterRailOpen(nextValue || defenseMode)
      if (!nextValue && !defenseMode) {
        setSpotlightMode(false)
      }

      return nextValue
    })
  }

  function handleToggleDefenseMode() {
    const nextValue = !defenseMode
    setDefenseMode(nextValue)

    if (nextValue) {
      setPresenterRailOpen(true)
      return
    }

    if (!presenterMode) {
      setPresenterRailOpen(false)
      setSpotlightMode(false)
    }
  }

  function handleOpenPresenterRail() {
    if (!presenterEnabled) {
      setPresenterMode(true)
    }

    setPresenterRailOpen(true)
  }

  return (
    <div
      className={`app-shell${defenseMode ? ' app-shell--defense' : ''}${
        presenterEnabled ? ' app-shell--presenter' : ''
      }${presenterRailOpen ? ' app-shell--presenter-open' : ''}${
        spotlightMode ? ' app-shell--presenter-spotlight' : ''
      }`}
    >
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
              <strong>
                {defenseMode
                  ? 'Defense Mode'
                  : presenterMode
                    ? 'Presenter Mode'
                    : 'Standard View'}
              </strong>
              <div className="meta-card-actions">
                <div className="chip-row">
                  <StatusBadge
                    label={defenseMode ? 'Defense Emphasis On' : 'Defense Emphasis Off'}
                    tone={defenseMode ? 'success' : 'neutral'}
                  />
                  <StatusBadge
                    label={presenterEnabled ? 'Presenter Rail Ready' : 'Presenter Rail Off'}
                    tone={presenterEnabled ? 'success' : 'neutral'}
                  />
                </div>
                <div className="form-actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={handleToggleDefenseMode}
                    aria-pressed={defenseMode}
                  >
                    {defenseMode ? 'Disable Defense Mode' : 'Enable Defense Mode'}
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={handleTogglePresenterMode}
                    aria-pressed={presenterMode}
                  >
                    {presenterMode ? 'Disable Presenter Mode' : 'Enable Presenter Mode'}
                  </button>
                </div>
                <span className="cell-muted">Quick toggle: {presenterHotkeyLabel}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="content-shell">
          <Outlet context={outletContext} />
        </main>
      </div>

      {presenterEnabled && presenterRailOpen ? (
        <PresenterRail
          defenseMode={defenseMode}
          presenterMode={presenterMode}
          spotlightMode={spotlightMode}
          onTogglePresenterMode={handleTogglePresenterMode}
          onToggleSpotlightMode={() => setSpotlightMode((current) => !current)}
          onClose={() => setPresenterRailOpen(false)}
        />
      ) : (
        <button
          className={`presenter-launcher${
            presenterEnabled ? ' presenter-launcher--collapsed' : ' presenter-launcher--idle'
          }`}
          type="button"
          onClick={handleOpenPresenterRail}
          aria-label={presenterEnabled ? 'Open presenter rail' : 'Enable presenter mode'}
        >
          <span className="presenter-launcher-icon" aria-hidden="true">
            PR
          </span>
          <span className="presenter-launcher-copy">
            <strong>Presenter Rail</strong>
            <span>
              {presenterEnabled ? 'Collapsed presenter surface' : 'Enable presenter mode'}
            </span>
          </span>
          <span className="presenter-launcher-shortcut">{presenterHotkeyLabel}</span>
        </button>
      )}
    </div>
  )
}
