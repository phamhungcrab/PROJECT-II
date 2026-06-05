export const dashboardRefreshEventName = 'sdn:dashboard-refresh-success'

export interface DashboardRefreshEventDetail {
  refreshedAt: string
}

export function notifyDashboardRefresh(refreshedAt: string) {
  window.dispatchEvent(
    new CustomEvent<DashboardRefreshEventDetail>(dashboardRefreshEventName, {
      detail: { refreshedAt },
    }),
  )
}
