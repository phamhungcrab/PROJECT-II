import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDefenseMode } from '../app/defenseMode'
import { EmptyState } from '../components/state/EmptyState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { policyApi } from '../services/api/policyApi'
import { sdnApi } from '../services/api/sdnApi'
import type { AlertRecord } from '../types/alerts'
import type {
  DemoPolicyStatusResponse,
  PolicyDriftSummaryResponse,
  PolicyEventsResponse,
  PolicySummaryResponse,
} from '../types/policy'
import type {
  HealthResponse,
  InventoryNodesResponse,
  OvsLiveFlowsResponse,
} from '../types/sdn'
import {
  buildOperationalAlerts,
  getAlertSeverityTone,
  getAlertStatusTone,
  summarizeAlerts,
} from '../utils/alertCenter'
import { formatDateTime, formatNumber } from '../utils/formatters'

interface AlertCenterData {
  checkedAt: string
  health: HealthResponse | null
  healthError: string | null
  inventory: InventoryNodesResponse | null
  inventoryError: string | null
  policySummary: PolicySummaryResponse | null
  policySummaryError: string | null
  policyEvents: PolicyEventsResponse | null
  policyEventsError: string | null
  driftSummary: PolicyDriftSummaryResponse | null
  driftError: string | null
  demoStatus: DemoPolicyStatusResponse | null
  demoStatusError: string | null
  ovsEvidence: OvsLiveFlowsResponse | null
  ovsEvidenceError: string | null
}

async function loadSource<T>(loader: () => Promise<T>) {
  try {
    const data = await loader()
    return {
      data,
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unexpected data source failure.',
    }
  }
}

export function AlertCenterPage() {
  const { defenseMode } = useDefenseMode()
  const [baselineRecoveryLoading, setBaselineRecoveryLoading] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, reload } = useApiResource<AlertCenterData>(async () => {
    const [
      health,
      inventory,
      policySummary,
      policyEvents,
      driftSummary,
      demoStatus,
      ovsEvidence,
    ] = await Promise.all([
      loadSource(() => sdnApi.getHealth()),
      loadSource(() => sdnApi.getInventoryNodes()),
      loadSource(() => policyApi.getSummary()),
      loadSource(() => policyApi.getEvents()),
      loadSource(() => policyApi.getDriftSummary()),
      loadSource(() => policyApi.getDemoStatus()),
      loadSource(() => sdnApi.getOvsFlows()),
    ])

    return {
      checkedAt: new Date().toISOString(),
      health: health.data,
      healthError: health.error,
      inventory: inventory.data,
      inventoryError: inventory.error,
      policySummary: policySummary.data,
      policySummaryError: policySummary.error,
      policyEvents: policyEvents.data,
      policyEventsError: policyEvents.error,
      driftSummary: driftSummary.data,
      driftError: driftSummary.error,
      demoStatus: demoStatus.data,
      demoStatusError: demoStatus.error,
      ovsEvidence: ovsEvidence.data,
      ovsEvidenceError: ovsEvidence.error,
    }
  }, [])

  const alerts = useMemo(() => {
    if (!data) {
      return []
    }

    return buildOperationalAlerts({
      checkedAt: data.checkedAt,
      health: data.health,
      healthError: data.healthError,
      inventory: data.inventory,
      policySummary: data.policySummary,
      policySummaryError: data.policySummaryError,
      driftSummary: data.driftSummary,
      driftError: data.driftError,
      demoStatus: data.demoStatus,
      demoStatusError: data.demoStatusError,
      ovsEvidence: data.ovsEvidence,
      ovsEvidenceError: data.ovsEvidenceError,
    })
  }, [data])
  const alertSummary = summarizeAlerts(alerts)
  const topCriticalAlert = alerts.find((alert) => alert.severity === 'critical') ?? null
  const recentPolicyEvents = (data?.policyEvents?.events ?? []).slice(0, 4)

  async function handleRecoverBaseline() {
    setBaselineRecoveryLoading(true)
    setActionError(null)
    setActionMessage(null)

    try {
      await policyApi.recoverBaselineDemo()
      setActionMessage(
        'Baseline recovery was triggered. Refreshing alert signals and live evidence now.',
      )
      reload()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Unable to trigger baseline recovery.',
      )
    } finally {
      setBaselineRecoveryLoading(false)
    }
  }

  function renderAlertAction(alert: AlertRecord) {
    if (alert.action_kind === 'recover-baseline') {
      return (
        <button
          className="button button--ghost"
          type="button"
          onClick={() => void handleRecoverBaseline()}
          disabled={baselineRecoveryLoading}
        >
          {baselineRecoveryLoading ? 'Running...' : alert.action_label ?? 'Recover Baseline'}
        </button>
      )
    }

    if (alert.action_kind === 'refresh') {
      return (
        <button className="button button--ghost" type="button" onClick={reload}>
          {alert.action_label ?? 'Refresh'}
        </button>
      )
    }

    if (alert.action_kind === 'navigate' && alert.related_path) {
      return (
        <Link
          className="button button--ghost"
          to={alert.related_path}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          {alert.action_label ?? 'Open'}
        </Link>
      )
    }

    return null
  }

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Alert / Fault Center</h2>
          <p className="section-copy">
            Operator-facing alert layer for drift, stale state, evidence gaps, and
            demo hygiene warnings derived from the current product state.
          </p>
        </div>

        <button className="button" type="button" onClick={reload} disabled={isLoading}>
          Refresh alert center
        </button>
      </section>

      {isLoading && !data ? (
        <LoadingState label="Loading alert and fault signals..." />
      ) : null}

      {data ? (
        <>
          <div className="stats-grid">
            <StatCard
              label="Active Alerts"
              value={formatNumber(alertSummary.active_alerts)}
              helper="Warnings and critical conditions that need operator review"
              tone={alertSummary.active_alerts === 0 ? 'success' : 'accent'}
            />
            <StatCard
              label="Critical"
              value={formatNumber(alertSummary.critical_count)}
              helper="Controller or switch-evidence issues"
            />
            <StatCard
              label="Warning"
              value={formatNumber(alertSummary.warning_count)}
              helper="Drift, stale state, or demo hygiene issues"
            />
            <StatCard
              label="Info"
              value={formatNumber(alertSummary.info_count)}
              helper="Healthy watch-state signals"
              tone="success"
            />
          </div>

          <div className="content-grid content-grid--two">
            <Panel
              title="Alert Watch Summary"
              description="Compact summary of the most important current operator signal."
              className={defenseMode ? 'panel--defense-primary' : undefined}
              action={
                <StatusBadge
                  label={
                    alertSummary.critical_count > 0
                      ? 'Critical'
                      : alertSummary.warning_count > 0
                        ? 'Warning'
                        : 'Stable'
                  }
                  tone={
                    alertSummary.critical_count > 0
                      ? 'danger'
                      : alertSummary.warning_count > 0
                        ? 'warning'
                        : 'success'
                  }
                />
              }
            >
              <div
                className="metadata-item"
                style={{
                  background:
                    alertSummary.critical_count > 0
                      ? 'var(--danger-soft)'
                      : alertSummary.warning_count > 0
                        ? 'var(--warning-soft)'
                        : 'var(--success-soft)',
                }}
              >
                <span className="metadata-label">Primary Signal</span>
                <strong className="metadata-value" style={{ marginTop: '12px' }}>
                  {topCriticalAlert?.title ?? alerts[0]?.title ?? 'No active faults detected'}
                </strong>
                <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                  {topCriticalAlert?.summary ??
                    alerts[0]?.summary ??
                    'Control-plane telemetry currently looks aligned.'}
                </p>
              </div>

              <div className="form-actions" style={{ marginTop: '16px' }}>
                <button className="button button--ghost" type="button" onClick={reload}>
                  Refresh Signals
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleRecoverBaseline()}
                  disabled={baselineRecoveryLoading}
                >
                  {baselineRecoveryLoading ? 'Running...' : 'Recover Baseline'}
                </button>
                <Link
                  className="button button--secondary"
                  to="/policies"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Open Policy Center
                </Link>
                <Link
                  className="button button--secondary"
                  to="/flows"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Open Flows
                </Link>
              </div>

              <p className="entity-list-meta" style={{ marginTop: '16px' }}>
                Last checked {formatDateTime(data.checkedAt)}. Alerts are derived from
                current health, policy, switch-evidence, and model-snapshot signals.
              </p>

              {actionError ? (
                <div className="notice notice--warning" style={{ marginTop: '16px' }}>
                  {actionError}
                </div>
              ) : null}

              {actionMessage ? (
                <div className="metadata-item" style={{ marginTop: '16px' }}>
                  <span className="metadata-label">Operator Note</span>
                  <strong className="metadata-value" style={{ marginTop: '12px' }}>
                    {actionMessage}
                  </strong>
                </div>
              ) : null}
            </Panel>

            <Panel
              title="Recent Policy Events"
              description="Recent backend policy activity that can explain current alerts."
            >
              {recentPolicyEvents.length === 0 ? (
                <EmptyState
                  title="No recent policy events"
                  description="Policy event history is currently empty or unavailable."
                />
              ) : (
                <ul className="entity-list" style={{ marginTop: 0 }}>
                  {recentPolicyEvents.map((event) => (
                    <li key={event.id} className="entity-list-item">
                      <div>
                        <div className="entity-list-heading">
                          <strong>{event.policy_name}</strong>
                          <StatusBadge
                            label={event.compliance}
                            tone={
                              event.compliance === 'COMPLIANT'
                                ? 'success'
                                : event.compliance === 'DRIFT'
                                  ? 'danger'
                                  : event.compliance === 'PARTIAL'
                                    ? 'warning'
                                    : 'neutral'
                            }
                          />
                        </div>
                        <p className="entity-list-meta">
                          {event.action} · {event.message}
                        </p>
                      </div>
                      <span className="entity-list-trailing">
                        {formatDateTime(event.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Panel
            title="Alert Feed"
            description="Readable fault list with severity, source, suggested action, and safe navigation or recovery paths."
            className={defenseMode ? 'panel--defense-primary' : undefined}
          >
            {alerts.length === 0 ? (
              <EmptyState
                title="No alerts generated"
                description="Alert generation did not produce any current signals."
              />
            ) : (
              <ul className="entity-list" style={{ marginTop: 0 }}>
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="entity-list-item"
                    style={{
                      background:
                        alert.severity === 'critical'
                          ? 'var(--danger-soft)'
                          : alert.severity === 'warning'
                            ? 'var(--warning-soft)'
                            : 'transparent',
                      borderRadius: '18px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="entity-list-heading">
                        <strong>{alert.title}</strong>
                        <StatusBadge
                          label={alert.severity.toUpperCase()}
                          tone={getAlertSeverityTone(alert.severity)}
                        />
                        <StatusBadge
                          label={alert.status}
                          tone={getAlertStatusTone(alert.status, alert.severity)}
                        />
                      </div>
                      <p className="entity-list-meta">{alert.source} · {alert.related_area}</p>
                      <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                        {alert.summary}
                      </p>
                      <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                        Suggested action: {alert.suggested_action}
                      </p>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: '10px',
                        justifyItems: 'end',
                      }}
                    >
                      <span className="entity-list-trailing">
                        {formatDateTime(alert.timestamp)}
                      </span>
                      {renderAlertAction(alert)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  )
}
