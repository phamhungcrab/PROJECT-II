import { useEffect, useState } from 'react'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { policyApi } from '../services/api/policyApi'
import type {
  PolicyActionResponse,
  PolicyCompliance,
  PolicyDesiredState,
  PolicyEventRecord,
  PolicyEvidenceResponse,
  PolicyPreview,
  PolicyRecord,
  PolicyVerificationsResponse,
} from '../types/policy'
import { formatDateTime, formatLabel, formatNumber } from '../utils/formatters'

type PolicyFilter = 'all' | 'compliant' | 'drift' | 'enabled'
type PolicyRowAction = 'preview' | 'apply' | 'verify' | 'rollback'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected policy request failure.'
}

function getComplianceTone(
  compliance: PolicyCompliance | null | undefined,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (compliance === 'COMPLIANT') {
    return 'success'
  }

  if (compliance === 'PARTIAL') {
    return 'warning'
  }

  if (compliance === 'DRIFT') {
    return 'danger'
  }

  return 'neutral'
}

function getLiveStateTone(
  liveState: PolicyRecord['live_state'] | null | undefined,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (liveState === 'ENFORCED') {
    return 'success'
  }

  if (liveState === 'PARTIAL') {
    return 'warning'
  }

  if (liveState === 'NOT_ENFORCED') {
    return 'neutral'
  }

  return 'danger'
}

function getDesiredStateTone(
  desiredState: PolicyDesiredState | null | undefined,
): 'neutral' | 'success' | 'warning' {
  return desiredState === 'ENABLED' ? 'success' : 'neutral'
}

function formatState(value: string | null | undefined) {
  return value ? formatLabel(value) : 'N/A'
}

function summarizeEvidenceLabels(evidence: PolicyEvidenceResponse | null) {
  const latestEvidence = evidence?.evidence[0]
  if (!latestEvidence || latestEvidence.relevant_flows.length === 0) {
    return []
  }

  return latestEvidence.relevant_flows.map((flow) => flow.label || flow.cookie)
}

export function PolicyCenterPage() {
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyRecord | null>(null)
  const [policyPreview, setPolicyPreview] = useState<PolicyPreview | null>(null)
  const [policyEvidence, setPolicyEvidence] = useState<PolicyEvidenceResponse | null>(
    null,
  )
  const [policyVerifications, setPolicyVerifications] =
    useState<PolicyVerificationsResponse | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [actionState, setActionState] = useState<{
    policyId: string
    action: PolicyRowAction
  } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<PolicyActionResponse | null>(null)

  const policyQuery = useApiResource(policyApi.listPolicies, [])
  const summaryQuery = useApiResource(policyApi.getSummary, [])
  const eventsQuery = useApiResource(policyApi.getEvents, [])
  const driftQuery = useApiResource(policyApi.getDriftSummary, [])

  const policies = policyQuery.data?.policies
  const policyList = policies ?? []
  const policyEvents = eventsQuery.data?.events ?? []
  const selectedPolicyEvents = selectedPolicyId
    ? policyEvents
        .filter((event) => event.policy_id === selectedPolicyId)
        .slice(0, 5)
    : []
  const normalizedSearch = searchQuery.trim().toLowerCase()

  const filteredPolicies = policyList.filter((policy) => {
    if (policyFilter === 'compliant' && policy.compliance !== 'COMPLIANT') {
      return false
    }

    if (policyFilter === 'drift' && policy.compliance !== 'DRIFT') {
      return false
    }

    if (policyFilter === 'enabled' && !policy.enabled) {
      return false
    }

    if (!normalizedSearch) {
      return true
    }

    const searchableText = [policy.name, policy.type, policy.target]
      .join(' ')
      .toLowerCase()

    return searchableText.includes(normalizedSearch)
  })

  useEffect(() => {
    if (!policies || policies.length === 0) {
      setSelectedPolicyId(null)
      return
    }

    if (!selectedPolicyId || !policies.some((policy) => policy.id === selectedPolicyId)) {
      setSelectedPolicyId(policies[0].id)
    }
  }, [policies, selectedPolicyId])

  async function loadPolicyWorkspace(policyId: string) {
    setIsDetailLoading(true)
    setDetailError(null)

    try {
      const [policy, preview, evidence, verifications] = await Promise.all([
        policyApi.getPolicy(policyId),
        policyApi.previewPolicy(policyId),
        policyApi.getEvidence(policyId),
        policyApi.getVerifications(policyId),
      ])

      setSelectedPolicy(policy)
      setPolicyPreview(preview)
      setPolicyEvidence(evidence)
      setPolicyVerifications(verifications)
    } catch (error) {
      setDetailError(getErrorMessage(error))
    } finally {
      setIsDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!selectedPolicyId) {
      setSelectedPolicy(null)
      setPolicyPreview(null)
      setPolicyEvidence(null)
      setPolicyVerifications(null)
      return
    }

    void loadPolicyWorkspace(selectedPolicyId)
  }, [selectedPolicyId])

  async function refreshPolicyCenter(policyId: string | null = selectedPolicyId) {
    policyQuery.reload()
    summaryQuery.reload()
    eventsQuery.reload()
    driftQuery.reload()

    if (policyId) {
      await loadPolicyWorkspace(policyId)
    }
  }

  async function handlePreview(policyId: string) {
    setActionError(null)
    setSelectedPolicyId(policyId)

    if (selectedPolicyId === policyId) {
      setActionState({ policyId, action: 'preview' })

      try {
        await loadPolicyWorkspace(policyId)
      } finally {
        setActionState(null)
      }
    }
  }

  async function runPolicyAction(policyId: string, action: PolicyRowAction) {
    if (action === 'preview') {
      await handlePreview(policyId)
      return
    }

    setSelectedPolicyId(policyId)
    setActionState({ policyId, action })
    setActionError(null)

    try {
      let response: PolicyActionResponse

      if (action === 'apply') {
        response = await policyApi.applyPolicy(policyId)
      } else if (action === 'verify') {
        response = await policyApi.verifyPolicy(policyId)
      } else {
        response = await policyApi.rollbackPolicy(policyId)
      }

      setActionResult(response)
      await refreshPolicyCenter(policyId)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setActionState(null)
    }
  }

  const latestEvidence = policyEvidence?.evidence[0] ?? null
  const latestVerification = policyVerifications?.verifications[0] ?? null
  const evidenceLabels = summarizeEvidenceLabels(policyEvidence)

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Policy Center</h2>
          <p className="section-copy">
            Operator view for object-based SDN policies, live compliance status,
            and enforcement evidence captured from Open vSwitch.
          </p>
        </div>

        <div className="hero-actions">
          <button
            className="button"
            type="button"
            onClick={() => void refreshPolicyCenter()}
            disabled={policyQuery.isLoading || isDetailLoading}
          >
            Refresh Policy Center
          </button>
        </div>
      </section>

      {policyQuery.isLoading && !policyQuery.data ? (
        <LoadingState label="Loading policy inventory..." />
      ) : null}

      {policyQuery.error && !policyQuery.data ? (
        <ErrorState message={policyQuery.error} onRetry={policyQuery.reload} />
      ) : null}

      {policyQuery.data ? (
        <>
          {policyQuery.error ? (
            <div className="notice notice--warning">
              Showing previously loaded policy data. Latest refresh failed:{' '}
              {policyQuery.error}
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Total Policies"
              value={formatNumber(summaryQuery.data?.total_policies ?? policyList.length)}
              helper="Policy objects currently tracked by the backend"
              tone="accent"
            />
            <StatCard
              label="Compliant"
              value={formatNumber(summaryQuery.data?.compliant_policies ?? 0)}
              helper="Policies aligned with live OVS enforcement"
              tone="success"
            />
            <StatCard
              label="Drift"
              value={formatNumber(driftQuery.data?.drift_count ?? 0)}
              helper="Policies needing operator attention"
            />
            <StatCard
              label="Unknown"
              value={formatNumber(summaryQuery.data?.unknown_policies ?? 0)}
              helper="Policies waiting for verified live evidence"
            />
            <StatCard
              label="Enabled"
              value={formatNumber(summaryQuery.data?.enabled_policies ?? 0)}
              helper="Desired active policies in the control plane"
            />
          </div>

          <Panel
            title="Policy Inventory"
            description="Search, filter, inspect, and operate on the current policy set."
            action={
              <span className="cell-muted">
                Showing {formatNumber(filteredPolicies.length)} of{' '}
                {formatNumber(policyList.length)} policies
              </span>
            }
          >
            <div className="form-actions" style={{ alignItems: 'center' }}>
              <button
                className={policyFilter === 'all' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setPolicyFilter('all')}
              >
                All
              </button>
              <button
                className={
                  policyFilter === 'compliant' ? 'button' : 'button button--secondary'
                }
                type="button"
                onClick={() => setPolicyFilter('compliant')}
              >
                Compliant
              </button>
              <button
                className={policyFilter === 'drift' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setPolicyFilter('drift')}
              >
                Drift
              </button>
              <button
                className={policyFilter === 'enabled' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setPolicyFilter('enabled')}
              >
                Enabled
              </button>
              <input
                className="input-field"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search name, type, target"
                style={{ minWidth: '260px', maxWidth: '360px' }}
              />
            </div>

            {actionError ? (
              <div className="notice notice--warning" style={{ marginTop: '16px' }}>
                Policy action failed: {actionError}
              </div>
            ) : null}

            {filteredPolicies.length === 0 ? (
              <div style={{ marginTop: '18px' }}>
                <EmptyState
                  title="No matching policies"
                  description="Try switching to All or clearing the current search query."
                />
              </div>
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Target</th>
                      <th>Desired</th>
                      <th>Live</th>
                      <th>Compliance</th>
                      <th>Last applied</th>
                      <th>Quick actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPolicies.map((policy) => {
                      const isSelected = policy.id === selectedPolicyId

                      return (
                        <tr
                          key={policy.id}
                          onClick={() => setSelectedPolicyId(policy.id)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected
                              ? 'rgba(15, 118, 110, 0.08)'
                              : policy.compliance === 'DRIFT'
                                ? 'rgba(185, 28, 28, 0.04)'
                                : policy.compliance === 'PARTIAL'
                                  ? 'rgba(180, 83, 9, 0.04)'
                                  : undefined,
                          }}
                        >
                          <td>
                            <div className="cell-stack">
                              <strong>{policy.name}</strong>
                              <span className="cell-muted mono">{policy.id}</span>
                            </div>
                          </td>
                          <td>{formatLabel(policy.type)}</td>
                          <td className="mono">{policy.target}</td>
                          <td>
                            <StatusBadge
                              label={formatState(policy.desired_state)}
                              tone={getDesiredStateTone(policy.desired_state)}
                            />
                          </td>
                          <td>
                            <StatusBadge
                              label={formatState(policy.live_state)}
                              tone={getLiveStateTone(policy.live_state)}
                            />
                          </td>
                          <td>
                            <StatusBadge
                              label={formatState(policy.compliance)}
                              tone={getComplianceTone(policy.compliance)}
                            />
                          </td>
                          <td>{formatDateTime(policy.last_applied_at)}</td>
                          <td>
                            <div className="form-actions">
                              <button
                                className="button button--ghost"
                                type="button"
                                style={{ padding: '8px 12px' }}
                                disabled={Boolean(actionState)}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void runPolicyAction(policy.id, 'preview')
                                }}
                              >
                                {actionState?.policyId === policy.id &&
                                actionState.action === 'preview'
                                  ? 'Loading...'
                                  : 'Preview'}
                              </button>
                              <button
                                className="button"
                                type="button"
                                style={{ padding: '8px 12px' }}
                                disabled={Boolean(actionState)}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void runPolicyAction(policy.id, 'apply')
                                }}
                              >
                                {actionState?.policyId === policy.id &&
                                actionState.action === 'apply'
                                  ? 'Running...'
                                  : 'Apply'}
                              </button>
                              <button
                                className="button button--secondary"
                                type="button"
                                style={{ padding: '8px 12px' }}
                                disabled={Boolean(actionState)}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void runPolicyAction(policy.id, 'verify')
                                }}
                              >
                                {actionState?.policyId === policy.id &&
                                actionState.action === 'verify'
                                  ? 'Running...'
                                  : 'Verify'}
                              </button>
                              <button
                                className="button button--secondary"
                                type="button"
                                style={{ padding: '8px 12px' }}
                                disabled={Boolean(actionState)}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  void runPolicyAction(policy.id, 'rollback')
                                }}
                              >
                                {actionState?.policyId === policy.id &&
                                actionState.action === 'rollback'
                                  ? 'Running...'
                                  : 'Rollback'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="content-grid content-grid--two">
            <Panel
              title={selectedPolicy ? selectedPolicy.name : 'Policy Detail'}
              description="Selected policy metadata, previewed enforcement mapping, and operator context."
            >
              {isDetailLoading && !selectedPolicy ? (
                <LoadingState label="Loading policy detail workspace..." />
              ) : null}

              {!selectedPolicyId ? (
                <EmptyState
                  title="No policy selected"
                  description="Select a policy row to inspect preview, evidence, and verification state."
                />
              ) : null}

              {detailError && !selectedPolicy ? (
                <div className="notice notice--warning">{detailError}</div>
              ) : null}

              {selectedPolicy ? (
                <>
                  {detailError ? (
                    <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                      Showing previously loaded policy detail. Latest refresh failed:{' '}
                      {detailError}
                    </div>
                  ) : null}

                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <span className="metadata-label">Target</span>
                      <strong className="metadata-value mono">{selectedPolicy.target}</strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Desired State</span>
                      <div style={{ marginTop: '8px' }}>
                        <StatusBadge
                          label={formatState(selectedPolicy.desired_state)}
                          tone={getDesiredStateTone(selectedPolicy.desired_state)}
                        />
                      </div>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Live State</span>
                      <div style={{ marginTop: '8px' }}>
                        <StatusBadge
                          label={formatState(selectedPolicy.live_state)}
                          tone={getLiveStateTone(selectedPolicy.live_state)}
                        />
                      </div>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Compliance</span>
                      <div style={{ marginTop: '8px' }}>
                        <StatusBadge
                          label={formatState(selectedPolicy.compliance)}
                          tone={getComplianceTone(selectedPolicy.compliance)}
                        />
                      </div>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Last Applied</span>
                      <strong className="metadata-value">
                        {formatDateTime(selectedPolicy.last_applied_at)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Last Verified</span>
                      <strong className="metadata-value">
                        {formatDateTime(selectedPolicy.last_verified_at)}
                      </strong>
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Description</span>
                    <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                      {selectedPolicy.description}
                    </p>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Mapped Enforcement Action</span>
                    <strong className="metadata-value" style={{ marginTop: '12px' }}>
                      {policyPreview?.mapped_enforcement_action ?? 'Loading preview...'}
                    </strong>
                    <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                      {policyPreview?.expected_impact ?? 'Expected impact unavailable.'}
                    </p>
                  </div>

                  <div className="content-grid" style={{ marginTop: '16px' }}>
                    <div className="metadata-item">
                      <span className="metadata-label">Notes</span>
                      <div className="chip-row" style={{ marginTop: '12px' }}>
                        {(policyPreview?.notes ?? []).length > 0 ? (
                          policyPreview?.notes.map((note) => (
                            <span key={note} className="chip">
                              {note}
                            </span>
                          ))
                        ) : (
                          <span className="cell-muted">No notes available.</span>
                        )}
                      </div>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Risk</span>
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        {policyPreview?.risk ?? 'Risk information unavailable.'}
                      </p>
                    </div>
                  </div>

                  {actionResult && actionResult.policy.id === selectedPolicy.id ? (
                    <div className="metadata-item" style={{ marginTop: '16px' }}>
                      <span className="metadata-label">Latest Control Result</span>
                      <div
                        style={{
                          marginTop: '12px',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <StatusBadge
                          label={formatState(actionResult.policy.compliance)}
                          tone={getComplianceTone(actionResult.policy.compliance)}
                        />
                        <strong className="metadata-value">
                          {actionResult.event.message}
                        </strong>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </Panel>

            <Panel
              title="Evidence Workspace"
              description="Compact live evidence, verification history, and recent policy activity for the selected object."
            >
              {isDetailLoading && !latestEvidence && selectedPolicyId ? (
                <LoadingState label="Loading evidence and verification history..." />
              ) : null}

              {!selectedPolicyId ? (
                <EmptyState
                  title="No evidence selected"
                  description="Choose a policy to review live OVS evidence and verification history."
                />
              ) : null}

              {selectedPolicyId && selectedPolicy ? (
                <>
                  <div className="mini-stats">
                    <div className="mini-stat">
                      <span>Latest evidence flows</span>
                      <strong>{formatNumber(latestEvidence?.flow_count ?? 0)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Verification runs</span>
                      <strong>
                        {formatNumber(policyVerifications?.count ?? 0)}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      <span>Recent policy events</span>
                      <strong>{formatNumber(selectedPolicyEvents.length)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Drifted policies</span>
                      <strong>{formatNumber(driftQuery.data?.drift_count ?? 0)}</strong>
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Latest Evidence Summary</span>
                    <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                      {latestEvidence?.summary ?? 'No evidence snapshot available yet.'}
                    </p>
                    {latestEvidence ? (
                      <div className="chip-row" style={{ marginTop: '12px' }}>
                        {latestEvidence.relevant_flows.length > 0 ? (
                          latestEvidence.relevant_flows.map((flow) => (
                            <span key={`${flow.cookie}-${flow.label}`} className="chip">
                              {flow.label} · {flow.cookie}
                            </span>
                          ))
                        ) : (
                          <span className="cell-muted">No relevant live flows recorded.</span>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Latest Verification</span>
                    <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                      {latestVerification?.summary ??
                        'No verification history available yet.'}
                    </p>
                    {latestVerification ? (
                      <div
                        style={{
                          marginTop: '12px',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                        }}
                      >
                        <StatusBadge
                          label={formatState(latestVerification.compliance)}
                          tone={getComplianceTone(latestVerification.compliance)}
                        />
                        <span className="cell-muted">
                          {formatDateTime(latestVerification.timestamp)}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Evidence Labels</span>
                    <div className="chip-row" style={{ marginTop: '12px' }}>
                      {evidenceLabels.length > 0 ? (
                        evidenceLabels.map((label) => (
                          <span key={label} className="chip">
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="cell-muted">No policy flow labels captured yet.</span>
                      )}
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Recent Policy Events</span>
                    {selectedPolicyEvents.length === 0 ? (
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        No recent policy events for this policy.
                      </p>
                    ) : (
                      <ul className="entity-list" style={{ marginTop: '12px' }}>
                        {selectedPolicyEvents.map((event: PolicyEventRecord) => (
                          <li key={event.id} className="entity-list-item">
                            <div>
                              <div className="entity-list-heading">
                                <strong>{formatLabel(event.action)}</strong>
                                <StatusBadge
                                  label={formatState(event.compliance)}
                                  tone={getComplianceTone(event.compliance)}
                                />
                              </div>
                              <p className="entity-list-meta">{event.message}</p>
                            </div>
                            <span className="entity-list-trailing">
                              {formatDateTime(event.timestamp)}
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
        </>
      ) : null}
    </div>
  )
}
