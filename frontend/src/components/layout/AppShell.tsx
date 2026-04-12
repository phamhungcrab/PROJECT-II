import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { navigationItems } from '../../app/navigation'
import { appConfig } from '../../config/appConfig'

const checkedAtFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function AppShell() {
  const location = useLocation()
  const currentPage =
    navigationItems.find((item) => location.pathname.startsWith(item.path)) ??
    navigationItems[0]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">SDN</div>
          <div>
            <p className="brand-title">{appConfig.appName}</p>
            <p className="brand-subtitle">OpenDaylight, Mininet, and OVS telemetry</p>
          </div>
        </div>

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

        <div className="sidebar-footer">
          <span className="sidebar-footer-label">Backend target</span>
          <code className="mono">{appConfig.apiBaseUrl}</code>
        </div>
      </aside>

      <div className="main-shell">
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
          </div>
        </header>

        <main className="content-shell">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
