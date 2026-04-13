export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'Open' | 'Watch'
export type AlertActionKind = 'navigate' | 'refresh' | 'recover-baseline'

export interface AlertRecord {
  id: string
  title: string
  severity: AlertSeverity
  source: string
  status: AlertStatus
  summary: string
  suggested_action: string
  related_area: string
  timestamp: string
  action_label?: string
  action_kind?: AlertActionKind
  related_path?: string
}

export interface AlertSummary {
  total_alerts: number
  active_alerts: number
  info_count: number
  warning_count: number
  critical_count: number
}
