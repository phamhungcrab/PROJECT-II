import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { appConfig } from '../config/appConfig'
import { useApiResource } from '../hooks/useApiResource'
import { policyApi } from '../services/api/policyApi'
import { sdnApi } from '../services/api/sdnApi'
import { classifyNode, formatDateTime, formatLabel, formatNumber } from '../utils/formatters'

interface DashboardData {
  health: Awaited<ReturnType<typeof sdnApi.getHealth>>
  topology: Awaited<ReturnType<typeof sdnApi.getTopologySummary>>
  inventory: Awaited<ReturnType<typeof sdnApi.getInventoryNodes>>
}

interface PolicyStatus {
  base_forwarding_enabled: boolean
  block_ping_enabled: boolean
  block_http_enabled: boolean
  isolate_h1_enabled: boolean
}

interface OvsEvidenceFlow {
  flow_type: 'base' | 'policy' | 'unknown'
  label: string
  cookie: string
  priority: number
  actions: string
}

interface OvsEvidence {
  bridge: string
  protocol: string
  flow_count: number
  flows: OvsEvidenceFlow[]
}

interface OperationLogEntry {
  timestamp: string
  action: string
  result: 'success' | 'failed'
}

interface ScenarioStep {
  action: string
  method: 'POST' | 'DELETE'
  path: string
}

interface ScenarioSummary {
  name: string
  completed: boolean
  stepCount: number
}

function createOperationTimestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function getComplianceTone(compliance: string) {
  if (compliance === 'COMPLIANT') {
    return 'success' as const
  }

  if (compliance === 'PARTIAL') {
    return 'warning' as const
  }

  if (compliance === 'DRIFT') {
    return 'danger' as const
  }

  return 'neutral' as const
}

export function DashboardPage() {
  const [policyLoadingAction, setPolicyLoadingAction] = useState<string | null>(null)
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [policyResult, setPolicyResult] = useState<string | null>(null)
  const [policyStatus, setPolicyStatus] = useState<PolicyStatus | null>(null)
  const [policyStatusError, setPolicyStatusError] = useState<string | null>(null)
  const [ovsEvidence, setOvsEvidence] = useState<OvsEvidence | null>(null)
  const [ovsEvidenceError, setOvsEvidenceError] = useState<string | null>(null)
  const [isOvsEvidenceLoading, setIsOvsEvidenceLoading] = useState(true)
  const [scenarioLoadingAction, setScenarioLoadingAction] = useState<string | null>(null)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const [scenarioResult, setScenarioResult] = useState<string | null>(null)
  const [scenarioSummary, setScenarioSummary] = useState<ScenarioSummary | null>(null)
  const [operationLogs, setOperationLogs] = useState<OperationLogEntry[]>([])

  const { data, error, isLoading, reload } = useApiResource<DashboardData>(
    async () => {
      const [health, topology, inventory] = await Promise.all([
        sdnApi.getHealth(),
        sdnApi.getTopologySummary(),
        sdnApi.getInventoryNodes(),
      ])

      return { health, topology, inventory }
    },
    [],
  )
  const policySummaryQuery = useApiResource(policyApi.getSummary, [])
  const policyEventsQuery = useApiResource(policyApi.getEvents, [])
  const policyDriftQuery = useApiResource(policyApi.getDriftSummary, [])

  const inventoryConnectorCount =
    data?.inventory.nodes.reduce(
      (total, node) => total + node.connector_count,
      0,
    ) ?? 0
  const managedFlowCount =
    data?.inventory.nodes.reduce((total, node) => total + node.flow_count, 0) ?? 0
  const managedTableCount =
    data?.inventory.nodes.reduce((total, node) => total + node.table_count, 0) ??
    0
  const latestSnapshot =
    data?.inventory.nodes.find((node) => node.snapshot?.end?.end)?.snapshot?.end?.end
  const isPolicyBusy = Boolean(policyLoadingAction || scenarioLoadingAction)
  const recentPolicyEvents = (policyEventsQuery.data?.events ?? []).slice(0, 5)
  const driftedPolicies = policyDriftQuery.data?.drifted_policies ?? []
  const ovsEvidenceFlows = ovsEvidence?.flows ?? []
  const ovsBaseFlowCount = ovsEvidenceFlows.filter((flow) => flow.flow_type === 'base').length
  const ovsPolicyFlows = ovsEvidenceFlows.filter((flow) => flow.flow_type === 'policy')
  const ovsUnknownFlowCount = ovsEvidenceFlows.filter(
    (flow) => flow.flow_type === 'unknown',
  ).length
  const hasPingPolicyFlow = ovsPolicyFlows.some((flow) =>
    flow.label.startsWith('Block Ping'),
  )
  const hasHttpPolicyFlow = ovsPolicyFlows.some((flow) =>
    flow.label.startsWith('Block HTTP'),
  )
  const hasIsolationPolicyFlow = ovsPolicyFlows.some((flow) =>
    flow.label.startsWith('Isolate H1'),
  )
  const isBaselineActive =
    policyStatus !== null &&
    policyStatus.base_forwarding_enabled &&
    !policyStatus.block_ping_enabled &&
    !policyStatus.block_http_enabled &&
    !policyStatus.isolate_h1_enabled
  const isEvidenceAligned =
    policyStatus !== null &&
    ovsEvidence !== null &&
    policyStatus.base_forwarding_enabled === (ovsBaseFlowCount > 0) &&
    policyStatus.block_ping_enabled === hasPingPolicyFlow &&
    policyStatus.block_http_enabled === hasHttpPolicyFlow &&
    policyStatus.isolate_h1_enabled === hasIsolationPolicyFlow
  const requiresOperatorAttention =
    policyStatus !== null && ovsEvidence !== null && !isEvidenceAligned

  function appendOperationLog(action: string, result: OperationLogEntry['result']) {
    setOperationLogs((current) =>
      [
        {
          timestamp: createOperationTimestamp(),
          action,
          result,
        },
        ...current,
      ].slice(0, 12),
    )
  }

  async function callPolicyEndpoint(
    method: 'POST' | 'DELETE',
    path: string,
  ): Promise<unknown> {
    const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
      },
    })

    const contentType = response.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')
    const payload: unknown = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String(payload.detail)
          : typeof payload === 'string'
            ? payload
            : `Request failed with status ${response.status}`

      throw new Error(detail)
    }

    return payload
  }

  async function loadPolicyStatus() {
    setPolicyStatusError(null)

    try {
      const response = await fetch(
        `${appConfig.apiBaseUrl}/api/policies/demo/block-ping/status`,
        {
          headers: {
            Accept: 'application/json',
          },
        },
      )

      const contentType = response.headers.get('content-type') ?? ''
      const isJson = contentType.includes('application/json')
      const payload: unknown = isJson ? await response.json() : await response.text()

      if (
        !response.ok ||
        !payload ||
        typeof payload !== 'object' ||
        !('base_forwarding_enabled' in payload) ||
        !('block_ping_enabled' in payload) ||
        !('block_http_enabled' in payload) ||
        !('isolate_h1_enabled' in payload)
      ) {
        throw new Error('Unable to load policy status')
      }

      setPolicyStatus({
        base_forwarding_enabled: Boolean(payload.base_forwarding_enabled),
        block_ping_enabled: Boolean(payload.block_ping_enabled),
        block_http_enabled: Boolean(payload.block_http_enabled),
        isolate_h1_enabled: Boolean(payload.isolate_h1_enabled),
      })
    } catch {
      setPolicyStatusError('Unable to load policy status')
    }
  }

  async function loadOvsEvidence() {
    setIsOvsEvidenceLoading(true)
    setOvsEvidenceError(null)

    try {
      const response = await fetch(`${appConfig.apiBaseUrl}/api/flows/ovs`, {
        headers: {
          Accept: 'application/json',
        },
      })

      const contentType = response.headers.get('content-type') ?? ''
      const isJson = contentType.includes('application/json')
      const payload: unknown = isJson ? await response.json() : await response.text()

      if (
        !response.ok ||
        !payload ||
        typeof payload !== 'object' ||
        !('bridge' in payload) ||
        !('protocol' in payload) ||
        !('flow_count' in payload) ||
        !('flows' in payload) ||
        !Array.isArray(payload.flows)
      ) {
        throw new Error('Unable to load live enforcement evidence')
      }

      setOvsEvidence(payload as OvsEvidence)
    } catch {
      setOvsEvidenceError('Unable to load live enforcement evidence')
    } finally {
      setIsOvsEvidenceLoading(false)
    }
  }

  useEffect(() => {
    void Promise.all([loadPolicyStatus(), loadOvsEvidence()])
  }, [])

  async function refreshOperationalState() {
    policySummaryQuery.reload()
    policyEventsQuery.reload()
    policyDriftQuery.reload()
    await Promise.all([loadPolicyStatus(), loadOvsEvidence()])
    void reload()
  }

  async function runPolicyAction(
    actionLabel: string,
    method: 'POST' | 'DELETE',
    path: string,
  ) {
    setPolicyLoadingAction(actionLabel)
    setPolicyError(null)

    try {
      const payload = await callPolicyEndpoint(method, path)
      setPolicyResult(JSON.stringify(payload, null, 2))
      appendOperationLog(actionLabel, 'success')
      await refreshOperationalState()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected policy request failure'

      setPolicyError(message)
      appendOperationLog(actionLabel, 'failed')
    } finally {
      setPolicyLoadingAction(null)
    }
  }

  async function runScenario(actionLabel: string, steps: ScenarioStep[]) {
    setScenarioLoadingAction(actionLabel)
    setScenarioError(null)

    try {
      const results: Array<{ action: string; response: unknown }> = []

      for (const step of steps) {
        const payload = await callPolicyEndpoint(step.method, step.path)
        results.push({
          action: step.action,
          response: payload,
        })
      }

      setScenarioResult(
        JSON.stringify(
          {
            scenario: actionLabel,
            completed: true,
            steps: results,
          },
          null,
          2,
        ),
      )
      setScenarioSummary({
        name: actionLabel,
        completed: true,
        stepCount: steps.length,
      })
      appendOperationLog(actionLabel, 'success')
      await refreshOperationalState()
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unexpected scenario request failure'

      setScenarioError(message)
      setScenarioResult(
        JSON.stringify(
          {
            scenario: actionLabel,
            completed: false,
            error: message,
          },
          null,
          2,
        ),
      )
      setScenarioSummary({
        name: actionLabel,
        completed: false,
        stepCount: steps.length,
      })
      appendOperationLog(actionLabel, 'failed')
    } finally {
      setScenarioLoadingAction(null)
    }
  }

  return (
    <div className="page">
      <section className="hero-banner">
        <div>
          <p className="eyebrow">Live SDN operations view</p>
          <h2 className="hero-title">Operational status of the OpenDaylight fabric</h2>
          <p className="hero-subtitle">
            This dashboard reads live data from the FastAPI backend and surfaces
            controller reachability, topology composition, inventory exposure, and
            the current OpenFlow footprint.
          </p>
        </div>

        <div className="hero-actions">
          <div className="meta-chip">
            <span>API</span>
            <strong className="mono">{appConfig.apiBaseUrl}</strong>
          </div>
          <button className="button" type="button" onClick={reload} disabled={isLoading}>
            Refresh dashboard
          </button>
        </div>
      </section>

      {isLoading && !data ? (
        <LoadingState label="Loading controller health and topology summary..." />
      ) : null}

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          {error ? (
            <div className="notice notice--warning">
              Showing previously loaded data. Latest refresh failed: {error}
            </div>
          ) : null}

          {requiresOperatorAttention ? (
            <div className="notice notice--warning">
              Operator attention required: dashboard status and live switch evidence
              are not fully aligned.
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Topology ID"
              value={<span className="mono">{data.topology.topology_id}</span>}
              helper="Target topology tracked by the controller"
              tone="accent"
            />
            <StatCard
              label="Nodes"
              value={formatNumber(data.topology.node_count)}
              helper={`${formatNumber(data.topology.switch_count)} switches / ${formatNumber(
                data.topology.host_count,
              )} hosts`}
            />
            <StatCard
              label="Links"
              value={formatNumber(data.topology.link_count)}
              helper={`${formatNumber(data.topology.termination_point_count)} termination points`}
            />
            <StatCard
              label="Inventory Connectors"
              value={formatNumber(inventoryConnectorCount)}
              helper={`${formatNumber(data.inventory.count)} managed inventory nodes`}
            />
            <StatCard
              label="Installed Flows"
              value={formatNumber(managedFlowCount)}
              helper={`${formatNumber(managedTableCount)} exposed tables`}
              tone="success"
            />
          </div>

          <div className="content-grid content-grid--two">
            <Panel
              title="Policy Compliance Summary"
              description="Compact backend-driven Policy Center snapshot for operator awareness."
              action={
                <Link
                  className="button button--ghost"
                  to="/policies"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Open Policy Center
                </Link>
              }
            >
              {policySummaryQuery.isLoading && !policySummaryQuery.data ? (
                <LoadingState label="Loading policy compliance summary..." />
              ) : null}

              {policySummaryQuery.error && !policySummaryQuery.data ? (
                <div className="notice notice--warning">{policySummaryQuery.error}</div>
              ) : null}

              {policySummaryQuery.data ? (
                <>
                  {policySummaryQuery.error ? (
                    <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                      Showing previously loaded policy summary. Latest refresh failed:{' '}
                      {policySummaryQuery.error}
                    </div>
                  ) : null}

                  <div className="mini-stats">
                    <div className="mini-stat">
                      <span>Total policies</span>
                      <strong>
                        {formatNumber(policySummaryQuery.data.total_policies)}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      <span>Compliant</span>
                      <strong>
                        {formatNumber(policySummaryQuery.data.compliant_policies)}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      <span>Drift</span>
                      <strong>{formatNumber(policyDriftQuery.data?.drift_count ?? 0)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Unknown</span>
                      <strong>
                        {formatNumber(policySummaryQuery.data.unknown_policies)}
                      </strong>
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Drift Summary</span>
                    {policyDriftQuery.data?.drifted_policies.length ? (
                      <div className="chip-row" style={{ marginTop: '12px' }}>
                        {driftedPolicies.map((policy) => (
                          <span key={policy.id} className="chip">
                            {policy.name} · {formatLabel(policy.compliance)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        No policy drift detected in the current backend snapshot.
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </Panel>

            <Panel
              title="Recent Policy Events"
              description="Latest backend policy actions and verification outcomes."
            >
              {policyEventsQuery.isLoading && !policyEventsQuery.data ? (
                <LoadingState label="Loading recent policy events..." />
              ) : null}

              {policyEventsQuery.error && !policyEventsQuery.data ? (
                <div className="notice notice--warning">{policyEventsQuery.error}</div>
              ) : null}

              {policyEventsQuery.data ? (
                <>
                  {policyEventsQuery.error ? (
                    <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                      Showing previously loaded policy events. Latest refresh failed:{' '}
                      {policyEventsQuery.error}
                    </div>
                  ) : null}

                  {recentPolicyEvents.length === 0 ? (
                    <p className="entity-list-meta">No backend policy events recorded yet.</p>
                  ) : (
                    <ul className="entity-list" style={{ marginTop: 0 }}>
                      {recentPolicyEvents.map((event) => (
                        <li key={event.id} className="entity-list-item">
                          <div>
                            <div className="entity-list-heading">
                              <strong>{event.policy_name}</strong>
                              <StatusBadge
                                label={formatLabel(event.compliance)}
                                tone={getComplianceTone(event.compliance)}
                              />
                            </div>
                            <p className="entity-list-meta">
                              {formatLabel(event.action)} · {event.message}
                            </p>
                          </div>
                          <span className="entity-list-trailing">
                            {formatDateTime(event.timestamp)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : null}
            </Panel>
          </div>

          <Panel
            title="Policy Control"
            description="Direct policy controls for base forwarding and traffic restrictions on the live SDN lab."
            action={
              <StatusBadge
                label={isPolicyBusy ? 'Applying' : 'Ready'}
                tone={isPolicyBusy ? 'warning' : 'neutral'}
              />
            }
          >
            <div className="form-actions">
              <button
                className="button"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Enable Base Forwarding',
                    'POST',
                    '/api/policies/demo/base-forwarding',
                  )
                }
              >
                {policyLoadingAction === 'Enable Base Forwarding'
                  ? 'Running...'
                  : 'Enable Base Forwarding'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Disable Base Forwarding',
                    'DELETE',
                    '/api/policies/demo/base-forwarding',
                  )
                }
              >
                {policyLoadingAction === 'Disable Base Forwarding'
                  ? 'Running...'
                  : 'Disable Base Forwarding'}
              </button>
              <button
                className="button"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Block Ping',
                    'POST',
                    '/api/policies/demo/block-ping',
                  )
                }
              >
                {policyLoadingAction === 'Block Ping' ? 'Running...' : 'Block Ping'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Allow Ping',
                    'DELETE',
                    '/api/policies/demo/block-ping',
                  )
                }
              >
                {policyLoadingAction === 'Allow Ping' ? 'Running...' : 'Allow Ping'}
              </button>
              <button
                className="button"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Block HTTP',
                    'POST',
                    '/api/policies/demo/block-http',
                  )
                }
              >
                {policyLoadingAction === 'Block HTTP' ? 'Running...' : 'Block HTTP'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Allow HTTP',
                    'DELETE',
                    '/api/policies/demo/block-http',
                  )
                }
              >
                {policyLoadingAction === 'Allow HTTP' ? 'Running...' : 'Allow HTTP'}
              </button>
              <button
                className="button"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Isolate H1',
                    'POST',
                    '/api/policies/demo/isolate-h1',
                  )
                }
              >
                {policyLoadingAction === 'Isolate H1' ? 'Running...' : 'Isolate H1'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Unisolate H1',
                    'DELETE',
                    '/api/policies/demo/isolate-h1',
                  )
                }
              >
                {policyLoadingAction === 'Unisolate H1'
                  ? 'Running...'
                  : 'Unisolate H1'}
              </button>
              <button
                className="button button--ghost"
                type="button"
                disabled={isPolicyBusy}
                onClick={() =>
                  runPolicyAction(
                    'Recover Baseline',
                    'POST',
                    '/api/policies/demo/recover-baseline',
                  )
                }
              >
                {policyLoadingAction === 'Recover Baseline'
                  ? 'Running...'
                  : 'Recover Baseline'}
              </button>
            </div>

            {policyError ? (
              <div className="notice notice--warning" style={{ marginTop: '16px' }}>
                Policy request failed: {policyError}
              </div>
            ) : null}

            <div className="metadata-item" style={{ marginTop: '16px' }}>
              <span className="metadata-label">Current Policy Status</span>
              <div
                style={{
                  marginTop: '12px',
                  display: 'grid',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <strong className="metadata-value">Base Forwarding</strong>
                  <StatusBadge
                    label={policyStatus?.base_forwarding_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.base_forwarding_enabled ? 'success' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <strong className="metadata-value">Block Ping</strong>
                  <StatusBadge
                    label={policyStatus?.block_ping_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.block_ping_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <strong className="metadata-value">Block HTTP</strong>
                  <StatusBadge
                    label={policyStatus?.block_http_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.block_http_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <strong className="metadata-value">Isolate H1</strong>
                  <StatusBadge
                    label={policyStatus?.isolate_h1_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.isolate_h1_enabled ? 'danger' : 'neutral'}
                  />
                </div>
                {policyStatusError ? (
                  <span className="cell-muted">{policyStatusError}</span>
                ) : null}
              </div>
            </div>

            <div className="metadata-item" style={{ marginTop: '16px' }}>
              <span className="metadata-label">Result JSON</span>
              <pre
                className="mono"
                style={{
                  marginTop: '12px',
                  marginBottom: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  color: 'var(--text-primary)',
                }}
              >
                {policyResult ?? 'No policy action executed yet.'}
              </pre>
            </div>
          </Panel>

          <div className="content-grid content-grid--two">
            <Panel
              title="Demo Scenarios"
              description="One-click demo presets for common SDN management situations."
              action={
                <StatusBadge
                  label={scenarioLoadingAction ? 'Executing' : 'Ready'}
                  tone={scenarioLoadingAction ? 'warning' : 'neutral'}
                />
              }
            >
              <div className="form-actions">
                <button
                  className="button"
                  type="button"
                  disabled={isPolicyBusy}
                  onClick={() =>
                    runScenario('Baseline', [
                      {
                        action: 'Recover Baseline',
                        method: 'POST',
                        path: '/api/policies/demo/recover-baseline',
                      },
                    ])
                  }
                >
                  {scenarioLoadingAction === 'Baseline' ? 'Running...' : 'Baseline'}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isPolicyBusy}
                  onClick={() =>
                    runScenario('Ping Block Demo', [
                      {
                        action: 'Recover Baseline',
                        method: 'POST',
                        path: '/api/policies/demo/recover-baseline',
                      },
                      {
                        action: 'Block Ping',
                        method: 'POST',
                        path: '/api/policies/demo/block-ping',
                      },
                    ])
                  }
                >
                  {scenarioLoadingAction === 'Ping Block Demo'
                    ? 'Running...'
                    : 'Ping Block Demo'}
                </button>
                <button
                  className="button"
                  type="button"
                  disabled={isPolicyBusy}
                  onClick={() =>
                    runScenario('HTTP Block Demo', [
                      {
                        action: 'Recover Baseline',
                        method: 'POST',
                        path: '/api/policies/demo/recover-baseline',
                      },
                      {
                        action: 'Block HTTP',
                        method: 'POST',
                        path: '/api/policies/demo/block-http',
                      },
                    ])
                  }
                >
                  {scenarioLoadingAction === 'HTTP Block Demo'
                    ? 'Running...'
                    : 'HTTP Block Demo'}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={isPolicyBusy}
                  onClick={() =>
                    runScenario('Host Isolation Demo', [
                      {
                        action: 'Recover Baseline',
                        method: 'POST',
                        path: '/api/policies/demo/recover-baseline',
                      },
                      {
                        action: 'Isolate H1',
                        method: 'POST',
                        path: '/api/policies/demo/isolate-h1',
                      },
                    ])
                  }
                >
                  {scenarioLoadingAction === 'Host Isolation Demo'
                    ? 'Running...'
                    : 'Host Isolation Demo'}
                </button>
              </div>

              {scenarioError ? (
                <div className="notice notice--warning" style={{ marginTop: '16px' }}>
                  Scenario execution failed: {scenarioError}
                </div>
              ) : null}

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Latest Scenario Result</span>
                {scenarioSummary ? (
                  <div
                    style={{
                      marginTop: '12px',
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                    }}
                  >
                    <strong className="metadata-value">{scenarioSummary.name}</strong>
                    <StatusBadge
                      label={scenarioSummary.completed ? 'Completed' : 'Failed'}
                      tone={scenarioSummary.completed ? 'success' : 'danger'}
                    />
                    <span className="cell-muted">
                      Step count {formatNumber(scenarioSummary.stepCount)}
                    </span>
                  </div>
                ) : null}
                <pre
                  className="mono"
                  style={{
                    marginTop: '12px',
                    marginBottom: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: 'var(--text-primary)',
                  }}
                >
                  {scenarioResult ?? 'No scenario executed yet.'}
                </pre>
              </div>
            </Panel>

            <Panel
              title="Quick Live Verification"
              description="Compact live state for fast narration during the demo session."
            >
              <div
                style={{
                  display: 'grid',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="metadata-value">Base Forwarding</span>
                  <StatusBadge
                    label={policyStatus?.base_forwarding_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.base_forwarding_enabled ? 'success' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="metadata-value">Block Ping</span>
                  <StatusBadge
                    label={policyStatus?.block_ping_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.block_ping_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="metadata-value">Block HTTP</span>
                  <StatusBadge
                    label={policyStatus?.block_http_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.block_http_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="metadata-value">Isolate H1</span>
                  <StatusBadge
                    label={policyStatus?.isolate_h1_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.isolate_h1_enabled ? 'danger' : 'neutral'}
                  />
                </div>
                {policyStatusError ? (
                  <span className="cell-muted">{policyStatusError}</span>
                ) : null}
              </div>
            </Panel>

            <Panel
              title="Demo Runbook"
              description="Operator-ready sequence for the live SDN policy demonstration."
            >
              <div
                style={{
                  display: 'grid',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">Baseline</strong>
                    <p className="entity-list-meta">Connectivity restored</p>
                  </div>
                  <StatusBadge
                    label={isBaselineActive ? 'Active' : 'Ready'}
                    tone={isBaselineActive ? 'success' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">Ping Block Demo</strong>
                    <p className="entity-list-meta">ICMP denied</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.block_ping_enabled ? 'Active' : 'Ready'}
                    tone={policyStatus?.block_ping_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">HTTP Block Demo</strong>
                    <p className="entity-list-meta">TCP/80 denied</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.block_http_enabled ? 'Active' : 'Ready'}
                    tone={policyStatus?.block_http_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">Host Isolation Demo</strong>
                    <p className="entity-list-meta">Host-to-host IPv4 denied</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.isolate_h1_enabled ? 'Active' : 'Ready'}
                    tone={policyStatus?.isolate_h1_enabled ? 'danger' : 'neutral'}
                  />
                </div>
              </div>
            </Panel>

            <Panel
              title="Active Policy Inventory"
              description="Current enforcement inventory for baseline forwarding and active SDN restrictions."
            >
              <div
                style={{
                  display: 'grid',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">Base Forwarding</strong>
                    <p className="entity-list-meta">Baseline switching path</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.base_forwarding_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.base_forwarding_enabled ? 'success' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">Ping Control</strong>
                    <p className="entity-list-meta">ICMP restriction policy</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.block_ping_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.block_ping_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">HTTP Control</strong>
                    <p className="entity-list-meta">TCP/80 restriction policy</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.block_http_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.block_http_enabled ? 'warning' : 'neutral'}
                  />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <strong className="metadata-value">Host Isolation</strong>
                    <p className="entity-list-meta">IPv4 host-to-host isolation</p>
                  </div>
                  <StatusBadge
                    label={policyStatus?.isolate_h1_enabled ? 'Enabled' : 'Disabled'}
                    tone={policyStatus?.isolate_h1_enabled ? 'danger' : 'neutral'}
                  />
                </div>
                {policyStatusError ? (
                  <span className="cell-muted">{policyStatusError}</span>
                ) : null}
              </div>
            </Panel>

            <Panel
              title="Live Enforcement Evidence"
              description="Direct switch evidence showing which enforcement flows are currently installed on Open vSwitch."
              action={
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => void loadOvsEvidence()}
                  disabled={isOvsEvidenceLoading}
                >
                  {isOvsEvidenceLoading ? 'Refreshing...' : 'Refresh evidence'}
                </button>
              }
            >
              {isOvsEvidenceLoading && !ovsEvidence ? (
                <LoadingState label="Loading live enforcement evidence..." />
              ) : null}

              {ovsEvidenceError && !ovsEvidence ? (
                <div className="notice notice--warning">{ovsEvidenceError}</div>
              ) : null}

              {ovsEvidence ? (
                <>
                  {ovsEvidenceError ? (
                    <div className="notice notice--warning">
                      Showing previously loaded evidence. Latest refresh failed:{' '}
                      {ovsEvidenceError}
                    </div>
                  ) : null}

                  <div className="mini-stats">
                    <div className="mini-stat">
                      <span>Base flows</span>
                      <strong>{formatNumber(ovsBaseFlowCount)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Policy flows</span>
                      <strong>{formatNumber(ovsPolicyFlows.length)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Unknown flows</span>
                      <strong>{formatNumber(ovsUnknownFlowCount)}</strong>
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Consistency Hint</span>
                    <div
                      style={{
                        marginTop: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <StatusBadge
                        label={isEvidenceAligned ? 'Aligned' : 'Attention'}
                        tone={isEvidenceAligned ? 'success' : 'warning'}
                      />
                      <strong className="metadata-value">
                        {isEvidenceAligned
                          ? 'Dashboard status and OVS flows are aligned'
                          : 'Dashboard status and OVS flows need attention'}
                      </strong>
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Active Policy Flows</span>

                    {ovsPolicyFlows.length === 0 ? (
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        No active policy flows on switch.
                      </p>
                    ) : (
                      <ul className="entity-list" style={{ marginTop: '12px' }}>
                        {ovsPolicyFlows.map((flow) => (
                          <li
                            key={`${flow.cookie}-${flow.label}`}
                            className="entity-list-item"
                          >
                            <div>
                              <div className="entity-list-heading">
                                <strong>{flow.label || 'Unclassified policy flow'}</strong>
                                <StatusBadge label="Policy" tone="warning" />
                              </div>
                              <p className="entity-list-meta">
                                Cookie <span className="mono">{flow.cookie}</span> ·
                                Priority {formatNumber(flow.priority)}
                              </p>
                            </div>
                            <span className="entity-list-trailing mono">
                              {flow.actions || 'N/A'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              ) : null}
            </Panel>
          </div>

          <Panel
            title="Operation Log"
            description="Recent management actions recorded locally for the live demo sequence."
            action={
              <button
                className="button button--ghost"
                type="button"
                onClick={() => setOperationLogs([])}
                disabled={operationLogs.length === 0}
              >
                Clear log
              </button>
            }
          >
            <p className="section-copy" style={{ marginBottom: '16px' }}>
              Recent operator actions ({operationLogs.length}/12)
            </p>
            {operationLogs.length === 0 ? (
              <span className="cell-muted">No operations executed yet.</span>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gap: '10px',
                }}
              >
                {operationLogs.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${entry.action}-${index}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '12px',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      paddingBottom: '10px',
                      borderBottom:
                        index === operationLogs.length - 1
                          ? 'none'
                          : '1px solid var(--border-subtle)',
                    }}
                  >
                    <span className="mono">
                      [{entry.timestamp}] {entry.action}
                    </span>
                    <StatusBadge
                      label={entry.result === 'success' ? 'Success' : 'Failed'}
                      tone={entry.result === 'success' ? 'success' : 'danger'}
                    />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <div className="content-grid content-grid--two">
            <Panel
              title="Controller status"
              description="Health and controller metadata returned by the FastAPI integration layer."
              action={
                <StatusBadge
                  label={data.health.status === 'ok' ? 'Operational' : 'Degraded'}
                  tone={data.health.status === 'ok' ? 'success' : 'danger'}
                />
              }
            >
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="metadata-label">Service</span>
                  <strong className="metadata-value">{data.health.service}</strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Version</span>
                  <strong className="metadata-value">{data.health.version}</strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Controller</span>
                  <strong className="metadata-value">
                    {data.health.controller.type}
                  </strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Controller endpoint</span>
                  <strong className="metadata-value mono">
                    {data.health.controller.base_url}
                  </strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Topology target</span>
                  <strong className="metadata-value mono">
                    {data.health.controller.topology_id}
                  </strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Latest inventory snapshot</span>
                  <strong className="metadata-value">{formatDateTime(latestSnapshot)}</strong>
                </div>
              </div>
            </Panel>

            <Panel
              title="Fabric footprint"
              description="Cross-check of the discovered topology against inventory data already exposed by OpenDaylight."
            >
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Managed nodes</span>
                  <strong>{formatNumber(data.inventory.count)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Topology nodes</span>
                  <strong>{formatNumber(data.topology.node_count)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Ports discovered</span>
                  <strong>{formatNumber(inventoryConnectorCount)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Known links</span>
                  <strong>{formatNumber(data.topology.link_count)}</strong>
                </div>
              </div>

              <ul className="entity-list">
                {data.topology.nodes.map((node) => (
                  <li key={node.node_id} className="entity-list-item">
                    <div>
                      <div className="entity-list-heading">
                        <span className="mono">{node.node_id}</span>
                        <StatusBadge
                          label={classifyNode(node.node_id)}
                          tone={node.node_id.startsWith('openflow:') ? 'success' : 'neutral'}
                        />
                      </div>
                      <p className="entity-list-meta">
                        {formatNumber(node.termination_point_count)} termination points
                        exposed
                      </p>
                    </div>
                    <span className="entity-list-trailing mono">
                      {node.inventory_ref ?? 'Topology only'}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  )
}
