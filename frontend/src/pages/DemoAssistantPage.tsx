import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  PolicyEvidenceResponse,
  PolicyEventRecord,
  PolicyLiveState,
  PolicyPreview,
  PolicyRecord,
  PolicyVerificationsResponse,
} from '../types/policy'
import { formatDateTime, formatLabel, formatNumber } from '../utils/formatters'

type DemoScenarioId =
  | 'baseline'
  | 'ping-block'
  | 'http-block'
  | 'host-isolation'

type ScenarioAction = 'refresh' | 'apply' | 'verify' | 'recover'

type ScenarioStatus = {
  label: 'Ready' | 'Active' | 'Attention'
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

interface DemoScenarioDefinition {
  id: DemoScenarioId
  title: string
  objective: string
  policyId: string
  operatorSteps: string[]
  expectedLiveOutcome: string
  expectedEvidence: string[]
  expectedCompliance: PolicyCompliance
  expectedLiveState: PolicyLiveState
  expectedFlowLabels: string[]
  expectedCookies: string[]
  pagesToCheck: Array<{ label: string; path: string }>
  rollbackNote: string
  speakerAssist: {
    policy: string
    desiredState: string
    evidence: string
    drift: string
    recovery: string
  }
}

const demoScenarios: DemoScenarioDefinition[] = [
  {
    id: 'baseline',
    title: 'Baseline',
    objective: 'Restore the normal forwarding path before any restrictive demo step.',
    policyId: 'baseline_forwarding',
    operatorSteps: [
      'Recover Baseline if the lab might be in an unknown state.',
      'Apply or verify the baseline forwarding policy.',
      'Show that the switch keeps only the base forwarding path aligned with the dashboard.',
    ],
    expectedLiveOutcome:
      'Host-to-host connectivity is restored and the switch keeps the normal forwarding rule active.',
    expectedEvidence: [
      'Compliance should read COMPLIANT.',
      'Live state should read ENFORCED.',
      'OVS evidence should show the Base Forwarding flow and no restrictive policy flows.',
    ],
    expectedCompliance: 'COMPLIANT',
    expectedLiveState: 'ENFORCED',
    expectedFlowLabels: ['Base Forwarding'],
    expectedCookies: ['0x1001'],
    pagesToCheck: [
      { label: 'Policy Center', path: '/policies' },
      { label: 'Flows', path: '/flows' },
    ],
    rollbackNote:
      'Baseline is itself the recovery path. If anything looks inconsistent, recover baseline again and verify once more.',
    speakerAssist: {
      policy:
        'This step establishes the desired steady state for the lab before applying restrictive controls.',
      desiredState:
        'Desired state means the switch should keep baseline forwarding active and no restrictive policy should dominate traffic.',
      evidence:
        'Live evidence is the Base Forwarding flow on OVS, which proves the forwarding path is present on the switch.',
      drift:
        'Drift here would mean baseline is expected but the normal flow is missing, partial, or overshadowed by leftover restrictive state.',
      recovery:
        'Recovery is immediate because the operator can re-apply baseline and verify the switch state again.',
    },
  },
  {
    id: 'ping-block',
    title: 'Ping Block Demo',
    objective: 'Demonstrate ICMP restriction between H1 and H2 without changing the rest of the lab.',
    policyId: 'block_ping_h1_h2',
    operatorSteps: [
      'Start from Baseline so the audience sees the clean state first.',
      'Apply the ping block policy and then run Verify.',
      'Show policy evidence and note that only ICMP is denied while the policy object stays compliant.',
    ],
    expectedLiveOutcome:
      'ICMP traffic between H1 and H2 is denied by switch policy while the enforcement state remains visible in Policy Center and OVS flows.',
    expectedEvidence: [
      'Compliance should read COMPLIANT.',
      'Live state should read ENFORCED.',
      'OVS evidence should show both Block Ping policy flows.',
    ],
    expectedCompliance: 'COMPLIANT',
    expectedLiveState: 'ENFORCED',
    expectedFlowLabels: ['Block Ping A->B', 'Block Ping B->A'],
    expectedCookies: ['0x9001', '0x9002'],
    pagesToCheck: [
      { label: 'Policy Center', path: '/policies' },
      { label: 'Flows', path: '/flows' },
    ],
    rollbackNote:
      'Use Rollback for the policy or Recover Baseline if you want to immediately return the entire lab to the normal state.',
    speakerAssist: {
      policy:
        'This policy demonstrates selective traffic control by denying ICMP without redesigning the whole topology.',
      desiredState:
        'Desired state means the ping restriction should be intentionally active for this scenario.',
      evidence:
        'Live enforcement evidence is the pair of Block Ping flows, which proves the policy is pushed to OVS instead of being only a dashboard flag.',
      drift:
        'Drift would appear if the dashboard says ping is blocked but the switch no longer carries the Block Ping cookies, or only one direction remains.',
      recovery:
        'Recovery is safe because the operator can roll back this policy or restore the baseline in one step.',
    },
  },
  {
    id: 'http-block',
    title: 'HTTP Block Demo',
    objective: 'Demonstrate application-layer style restriction by blocking TCP/80 between the demo hosts.',
    policyId: 'block_http_h1_h2',
    operatorSteps: [
      'Return to Baseline if needed so the audience sees a clean network first.',
      'Apply the HTTP block policy and then verify the live state.',
      'Point to the HTTP-specific flow evidence and explain that enforcement is narrow and observable.',
    ],
    expectedLiveOutcome:
      'TCP/80 between the hosts is denied while the switch records the dedicated HTTP restriction flows.',
    expectedEvidence: [
      'Compliance should read COMPLIANT.',
      'Live state should read ENFORCED.',
      'OVS evidence should show both Block HTTP policy flows.',
    ],
    expectedCompliance: 'COMPLIANT',
    expectedLiveState: 'ENFORCED',
    expectedFlowLabels: ['Block HTTP A->B', 'Block HTTP B->A'],
    expectedCookies: ['0x9011', '0x9012'],
    pagesToCheck: [
      { label: 'Policy Center', path: '/policies' },
      { label: 'Flows', path: '/flows' },
    ],
    rollbackNote:
      'Rollback removes the HTTP restriction safely. Recover Baseline is the fast full-lab fallback if the demo sequence needs a clean restart.',
    speakerAssist: {
      policy:
        'This policy shows that the controller can express more specific service restrictions, not just blanket host blocking.',
      desiredState:
        'Desired state means only the HTTP restriction should be active while the operator still tracks the policy object explicitly.',
      evidence:
        'Evidence is the pair of Block HTTP flows and the compliant policy state after verification.',
      drift:
        'Drift would mean the expected HTTP policy is no longer represented correctly on OVS, even if the UI still expects it.',
      recovery:
        'Recovery stays simple because the restriction can be rolled back directly or cleared by a baseline restore.',
    },
  },
  {
    id: 'host-isolation',
    title: 'Host Isolation Demo',
    objective: 'Demonstrate host-to-host IPv4 isolation with explicit evidence on the switch.',
    policyId: 'isolate_h1',
    operatorSteps: [
      'Start from Baseline to avoid residual restrictions from earlier scenarios.',
      'Apply the host isolation policy and verify it.',
      'Show that the OVS evidence carries the isolation cookies and explain the recovery path.',
    ],
    expectedLiveOutcome:
      'Host-to-host IPv4 traffic between H1 and H2 is isolated by policy, and the live switch evidence reflects that state.',
    expectedEvidence: [
      'Compliance should read COMPLIANT.',
      'Live state should read ENFORCED.',
      'OVS evidence should show both Isolate H1 policy flows.',
    ],
    expectedCompliance: 'COMPLIANT',
    expectedLiveState: 'ENFORCED',
    expectedFlowLabels: ['Isolate H1 A->B', 'Isolate H1 B->A'],
    expectedCookies: ['0x9021', '0x9022'],
    pagesToCheck: [
      { label: 'Policy Center', path: '/policies' },
      { label: 'Flows', path: '/flows' },
    ],
    rollbackNote:
      'Rollback removes the isolation policy. Recover Baseline is the quick operator reset if the demo needs to return to normal connectivity immediately.',
    speakerAssist: {
      policy:
        'This policy demonstrates stronger containment by isolating the host path instead of only one protocol.',
      desiredState:
        'Desired state means H1 isolation is intentionally active and should be visible in both the policy object and the switch evidence.',
      evidence:
        'Evidence is the pair of isolation flows plus a compliant verification result that closes the loop.',
      drift:
        'Drift would look like missing isolation flows, partial one-way enforcement, or a mismatch between desired and live state.',
      recovery:
        'Recovery remains operator-friendly because rollback is explicit and baseline restore is still available as the safe reset path.',
    },
  },
]

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected scenario request failure.'
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
  liveState: PolicyLiveState | null | undefined,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (liveState === 'ENFORCED') {
    return 'success'
  }

  if (liveState === 'PARTIAL') {
    return 'warning'
  }

  if (liveState === 'UNKNOWN') {
    return 'danger'
  }

  return 'neutral'
}

function formatState(value: string | null | undefined) {
  return value ? formatLabel(value) : 'N/A'
}

function isPolicyRestrictive(policy: PolicyRecord | null | undefined) {
  if (!policy) {
    return false
  }

  return policy.id !== 'baseline_forwarding' && policy.live_state === 'ENFORCED'
}

function getScenarioStatus(
  scenario: DemoScenarioDefinition,
  policyList: PolicyRecord[],
): ScenarioStatus {
  const currentPolicy = policyList.find((policy) => policy.id === scenario.policyId) ?? null

  if (!currentPolicy) {
    return {
      label: 'Attention',
      tone: 'danger',
    }
  }

  if (scenario.id === 'baseline') {
    const restrictivePoliciesActive = policyList.some(isPolicyRestrictive)

    if (
      currentPolicy.desired_state === 'ENABLED' &&
      currentPolicy.compliance === 'COMPLIANT' &&
      currentPolicy.live_state === 'ENFORCED'
    ) {
      return {
        label: restrictivePoliciesActive ? 'Ready' : 'Active',
        tone: restrictivePoliciesActive ? 'neutral' : 'success',
      }
    }

    if (currentPolicy.compliance === 'DRIFT' || currentPolicy.live_state === 'UNKNOWN') {
      return {
        label: 'Attention',
        tone: 'danger',
      }
    }

    return {
      label: 'Ready',
      tone: 'neutral',
    }
  }

  if (
    currentPolicy.desired_state === 'ENABLED' &&
    currentPolicy.live_state === 'ENFORCED' &&
    currentPolicy.compliance === 'COMPLIANT'
  ) {
    return {
      label: 'Active',
      tone: 'success',
    }
  }

  if (currentPolicy.compliance === 'DRIFT') {
    return {
      label: 'Attention',
      tone: 'danger',
    }
  }

  if (currentPolicy.compliance === 'PARTIAL' || currentPolicy.live_state === 'PARTIAL') {
    return {
      label: 'Attention',
      tone: 'warning',
    }
  }

  return {
    label: 'Ready',
    tone: 'neutral',
  }
}

function hasExpectedEvidence(
  scenario: DemoScenarioDefinition,
  evidence: PolicyEvidenceResponse | null,
) {
  const latestEvidence = evidence?.evidence[0]

  if (!latestEvidence) {
    return false
  }

  return latestEvidence.relevant_flows.some(
    (flow) =>
      scenario.expectedCookies.includes(flow.cookie) ||
      scenario.expectedFlowLabels.includes(flow.label),
  )
}

export function DemoAssistantPage() {
  const [selectedScenarioId, setSelectedScenarioId] = useState<DemoScenarioId>('baseline')
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyRecord | null>(null)
  const [policyPreview, setPolicyPreview] = useState<PolicyPreview | null>(null)
  const [policyEvidence, setPolicyEvidence] = useState<PolicyEvidenceResponse | null>(
    null,
  )
  const [policyVerifications, setPolicyVerifications] =
    useState<PolicyVerificationsResponse | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [scenarioAction, setScenarioAction] = useState<ScenarioAction | null>(null)
  const [scenarioActionError, setScenarioActionError] = useState<string | null>(null)
  const [scenarioActionMessage, setScenarioActionMessage] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<PolicyActionResponse | null>(null)

  const policyQuery = useApiResource(policyApi.listPolicies, [])
  const summaryQuery = useApiResource(policyApi.getSummary, [])
  const eventsQuery = useApiResource(policyApi.getEvents, [])
  const driftQuery = useApiResource(policyApi.getDriftSummary, [])

  const selectedScenario =
    demoScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? demoScenarios[0]
  const policyList = policyQuery.data?.policies ?? []
  const selectedScenarioEvents = (eventsQuery.data?.events ?? [])
    .filter((event) => event.policy_id === selectedScenario.policyId)
    .slice(0, 5)
  const latestEvidence = policyEvidence?.evidence[0] ?? null
  const latestVerification = policyVerifications?.verifications[0] ?? null
  const baselinePolicy =
    policyList.find((policy) => policy.id === 'baseline_forwarding') ?? null
  const activeRestrictivePolicies = policyList.filter(
    (policy) =>
      policy.id !== 'baseline_forwarding' &&
      (policy.enabled ||
        policy.desired_state === 'ENABLED' ||
        policy.live_state === 'ENFORCED'),
  )
  const hasMultipleRestrictivePolicies = activeRestrictivePolicies.length > 1
  const selectedScenarioStatus = getScenarioStatus(selectedScenario, policyList)
  const activeScenarioCount = demoScenarios.filter(
    (scenario) => getScenarioStatus(scenario, policyList).label === 'Active',
  ).length
  const selectedScenarioHasEvidence = hasExpectedEvidence(selectedScenario, policyEvidence)
  const selectedScenarioVerificationComplete = Boolean(
    selectedPolicy?.last_verified_at || (policyVerifications?.count ?? 0) > 0,
  )
  const selectedScenarioApplied = Boolean(
    selectedPolicy?.desired_state === 'ENABLED' || selectedPolicy?.enabled,
  )
  const recoveryAvailable = baselinePolicy !== null
  const selectedScenarioNeedsAttention =
    selectedScenarioStatus.label === 'Attention' ||
    selectedPolicy?.compliance === 'DRIFT' ||
    selectedPolicy?.live_state === 'PARTIAL'

  async function loadScenarioWorkspace(policyId: string) {
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
    setScenarioActionError(null)
    setScenarioActionMessage(null)
    void loadScenarioWorkspace(selectedScenario.policyId)
  }, [selectedScenario.policyId])

  async function refreshDemoAssistant(policyId: string = selectedScenario.policyId) {
    policyQuery.reload()
    summaryQuery.reload()
    eventsQuery.reload()
    driftQuery.reload()
    await loadScenarioWorkspace(policyId)
  }

  async function runScenarioAction(action: ScenarioAction) {
    setScenarioAction(action)
    setScenarioActionError(null)
    setScenarioActionMessage(null)

    try {
      if (action === 'refresh') {
        await refreshDemoAssistant()
        setScenarioActionMessage('Scenario state, events, and drift watch were refreshed.')
      } else if (action === 'apply') {
        const response = await policyApi.applyPolicy(selectedScenario.policyId)
        setActionResult(response)
        await refreshDemoAssistant(selectedScenario.policyId)
        setScenarioActionMessage(
          `Applied ${selectedScenario.title} policy and refreshed live evidence.`,
        )
      } else if (action === 'verify') {
        const response = await policyApi.verifyPolicy(selectedScenario.policyId)
        setActionResult(response)
        await refreshDemoAssistant(selectedScenario.policyId)
        setScenarioActionMessage(
          `Verified ${selectedScenario.title} against live enforcement evidence.`,
        )
      } else {
        await policyApi.recoverBaselineDemo()
        setActionResult(null)
        await refreshDemoAssistant(selectedScenario.policyId)
        setScenarioActionMessage(
          'Recovered the lab to baseline and refreshed the scenario workspace.',
        )
      }
    } catch (error) {
      setScenarioActionError(getErrorMessage(error))
    } finally {
      setScenarioAction(null)
    }
  }

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Demo Assistant</h2>
          <p className="section-copy">
            Defense-demo workspace for running scenario steps, checking live policy
            evidence, and keeping short speaker notes on screen while the lab changes.
          </p>
        </div>

        <div className="hero-actions">
          <button
            className="button"
            type="button"
            disabled={isDetailLoading || scenarioAction !== null}
            onClick={() => void runScenarioAction('refresh')}
          >
            {scenarioAction === 'refresh' ? 'Running...' : 'Refresh Demo State'}
          </button>
        </div>
      </section>

      {policyQuery.isLoading && !policyQuery.data ? (
        <LoadingState label="Loading demo scenarios and policy state..." />
      ) : null}

      {policyQuery.error && !policyQuery.data ? (
        <ErrorState message={policyQuery.error} onRetry={policyQuery.reload} />
      ) : null}

      {policyQuery.data ? (
        <>
          {policyQuery.error ? (
            <div className="notice notice--warning">
              Showing previously loaded scenario data. Latest refresh failed:{' '}
              {policyQuery.error}
            </div>
          ) : null}

          {hasMultipleRestrictivePolicies ? (
            <div className="notice notice--warning">
              Multiple restrictive policies are active. Recover baseline before
              running a clean single-scenario demo. Current restrictive set:{' '}
              {activeRestrictivePolicies.map((policy) => policy.name).join(', ')}.
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Demo Scenarios"
              value={formatNumber(demoScenarios.length)}
              helper="Curated operator runbook entries for defense mode"
              tone="accent"
            />
            <StatCard
              label="Active Scenarios"
              value={formatNumber(activeScenarioCount)}
              helper="Scenarios currently aligned with live enforcement"
              tone="success"
            />
            <StatCard
              label="Drift Policies"
              value={formatNumber(driftQuery.data?.drift_count ?? 0)}
              helper="Policies needing operator attention before or during demo"
            />
            <StatCard
              label="Recent Policy Events"
              value={formatNumber(eventsQuery.data?.count ?? 0)}
              helper="Latest policy actions recorded by the backend"
            />
            <StatCard
              label="Enabled Policies"
              value={formatNumber(summaryQuery.data?.enabled_policies ?? 0)}
              helper="Desired active policy objects in current control state"
            />
          </div>

          <div className="content-grid content-grid--two">
            <Panel
              title="Scenario Inventory"
              description="Choose a defense scenario and track whether the live switch state matches the intended demo story."
              action={
                <span className="cell-muted">
                  {formatNumber(activeScenarioCount)} active /{' '}
                  {formatNumber(demoScenarios.length)} total
                </span>
              }
            >
              <div
                style={{
                  display: 'grid',
                  gap: '14px',
                }}
              >
                {demoScenarios.map((scenario) => {
                  const status = getScenarioStatus(scenario, policyList)
                  const isSelected = scenario.id === selectedScenario.id

                  return (
                    <button
                      key={scenario.id}
                      className="metadata-item"
                      type="button"
                      onClick={() => setSelectedScenarioId(scenario.id)}
                      style={{
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderColor: isSelected
                          ? 'rgba(15, 118, 110, 0.26)'
                          : 'rgba(150, 169, 188, 0.16)',
                        background: isSelected
                          ? 'rgba(15, 118, 110, 0.08)'
                          : 'rgba(240, 246, 252, 0.72)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '12px',
                          alignItems: 'flex-start',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <strong className="metadata-value">{scenario.title}</strong>
                          <p className="entity-list-meta" style={{ marginTop: '8px' }}>
                            {scenario.objective}
                          </p>
                        </div>
                        <StatusBadge label={status.label} tone={status.tone} />
                      </div>

                      <div className="chip-row" style={{ marginTop: '12px' }}>
                        <span className="chip">Policy · {scenario.policyId}</span>
                        <span className="chip">
                          Evidence · {scenario.expectedCookies.join(' / ')}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Panel>

            <div className="content-grid">
              <Panel
                title={selectedScenario.title}
                description={selectedScenario.objective}
                action={
                  <StatusBadge
                    label={selectedScenarioStatus.label}
                    tone={selectedScenarioStatus.tone}
                  />
                }
              >
                {isDetailLoading && !selectedPolicy ? (
                  <LoadingState label="Loading selected scenario workspace..." />
                ) : null}

                {detailError && !selectedPolicy ? (
                  <div className="notice notice--warning">{detailError}</div>
                ) : null}

                {selectedPolicy ? (
                  <>
                    {detailError ? (
                      <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                        Showing previously loaded scenario detail. Latest refresh failed:{' '}
                        {detailError}
                      </div>
                    ) : null}

                    {selectedScenarioNeedsAttention ? (
                      <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                        This scenario needs attention before or during the demo. Verify the
                        selected policy and inspect live evidence before continuing the
                        narration.
                      </div>
                    ) : null}

                    {scenarioActionError ? (
                      <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                        {scenarioActionError}
                      </div>
                    ) : null}

                    {scenarioActionMessage ? (
                      <p className="entity-list-meta" style={{ marginBottom: '16px' }}>
                        {scenarioActionMessage}
                      </p>
                    ) : null}

                    <div className="mini-stats">
                      <div className="mini-stat">
                        <span>Desired state</span>
                        <strong>{formatState(selectedPolicy.desired_state)}</strong>
                      </div>
                      <div className="mini-stat">
                        <span>Live state</span>
                        <strong>{formatState(selectedPolicy.live_state)}</strong>
                      </div>
                      <div className="mini-stat">
                        <span>Compliance</span>
                        <strong>{formatState(selectedPolicy.compliance)}</strong>
                      </div>
                      <div className="mini-stat">
                        <span>Evidence flows</span>
                        <strong>{formatNumber(latestEvidence?.flow_count ?? 0)}</strong>
                      </div>
                    </div>

                    <div className="metadata-grid" style={{ marginTop: '16px' }}>
                      <div className="metadata-item">
                        <span className="metadata-label">Policy Involved</span>
                        <strong className="metadata-value">{selectedPolicy.name}</strong>
                        <p className="entity-list-meta" style={{ marginTop: '8px' }}>
                          {selectedPolicy.description}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <span className="metadata-label">Mapped Enforcement Action</span>
                        <strong className="metadata-value">
                          {policyPreview?.mapped_enforcement_action ?? 'Loading preview...'}
                        </strong>
                        <p className="entity-list-meta" style={{ marginTop: '8px' }}>
                          {policyPreview?.expected_impact ?? 'Expected impact unavailable.'}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <span className="metadata-label">Rollback / Recovery</span>
                        <p className="entity-list-meta">{selectedScenario.rollbackNote}</p>
                      </div>
                    </div>

                    <div className="content-grid content-grid--two" style={{ marginTop: '16px' }}>
                      <div className="metadata-item">
                        <span className="metadata-label">Operator Steps</span>
                        <ol
                          style={{
                            marginTop: '12px',
                            marginBottom: 0,
                            paddingLeft: '18px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {selectedScenario.operatorSteps.map((step) => (
                            <li key={step} style={{ marginTop: '8px' }}>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>

                      <div className="metadata-item">
                        <span className="metadata-label">Expected Live Outcome</span>
                        <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                          {selectedScenario.expectedLiveOutcome}
                        </p>
                        <div
                          style={{
                            marginTop: '12px',
                            display: 'flex',
                            gap: '10px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <StatusBadge
                            label={formatState(selectedScenario.expectedCompliance)}
                            tone={getComplianceTone(selectedScenario.expectedCompliance)}
                          />
                          <StatusBadge
                            label={formatState(selectedScenario.expectedLiveState)}
                            tone={getLiveStateTone(selectedScenario.expectedLiveState)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="content-grid content-grid--two" style={{ marginTop: '16px' }}>
                      <div className="metadata-item">
                        <span className="metadata-label">Expected Evidence</span>
                        <div className="chip-row" style={{ marginTop: '12px' }}>
                          {selectedScenario.expectedFlowLabels.map((label) => (
                            <span key={label} className="chip">
                              {label}
                            </span>
                          ))}
                          {selectedScenario.expectedCookies.map((cookie) => (
                            <span key={cookie} className="chip">
                              {cookie}
                            </span>
                          ))}
                        </div>
                        <ul
                          style={{
                            marginTop: '12px',
                            marginBottom: 0,
                            paddingLeft: '18px',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {selectedScenario.expectedEvidence.map((item) => (
                            <li key={item} style={{ marginTop: '8px' }}>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="metadata-item">
                        <span className="metadata-label">Observed Evidence</span>
                        <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                          {latestEvidence?.summary ?? 'No evidence snapshot available yet.'}
                        </p>
                        <div className="chip-row" style={{ marginTop: '12px' }}>
                          {latestEvidence?.relevant_flows.length ? (
                            latestEvidence.relevant_flows.map((flow) => (
                              <span key={`${flow.cookie}-${flow.label}`} className="chip">
                                {flow.label} · {flow.cookie}
                              </span>
                            ))
                          ) : (
                            <span className="cell-muted">
                              No compact evidence flows recorded yet.
                            </span>
                          )}
                        </div>
                        <div className="chip-row" style={{ marginTop: '12px' }}>
                          {selectedScenario.pagesToCheck.map((page) => (
                            <Link
                              key={page.path}
                              to={page.path}
                              className="button button--ghost"
                              style={{ textDecoration: 'none' }}
                            >
                              Open {page.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="metadata-item" style={{ marginTop: '16px' }}>
                      <span className="metadata-label">Run Status Checklist</span>
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
                            alignItems: 'center',
                            gap: '12px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <strong className="metadata-value">Policy applied</strong>
                          <StatusBadge
                            label={selectedScenarioApplied ? 'Applied' : 'Pending'}
                            tone={selectedScenarioApplied ? 'success' : 'neutral'}
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
                          <strong className="metadata-value">Verification completed</strong>
                          <StatusBadge
                            label={
                              selectedScenarioVerificationComplete ? 'Verified' : 'Pending'
                            }
                            tone={
                              selectedScenarioVerificationComplete ? 'success' : 'neutral'
                            }
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
                          <strong className="metadata-value">Evidence observed</strong>
                          <StatusBadge
                            label={selectedScenarioHasEvidence ? 'Observed' : 'Pending'}
                            tone={selectedScenarioHasEvidence ? 'success' : 'neutral'}
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
                          <strong className="metadata-value">Recovery available</strong>
                          <StatusBadge
                            label={recoveryAvailable ? 'Available' : 'Unavailable'}
                            tone={recoveryAvailable ? 'success' : 'neutral'}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="metadata-item" style={{ marginTop: '16px' }}>
                      <span className="metadata-label">Safe Actions</span>
                      <div className="form-actions" style={{ marginTop: '12px' }}>
                        <button
                          className="button"
                          type="button"
                          disabled={scenarioAction !== null}
                          onClick={() => void runScenarioAction('apply')}
                        >
                          {scenarioAction === 'apply'
                            ? 'Running...'
                            : `Apply ${selectedScenario.title}`}
                        </button>
                        <button
                          className="button button--secondary"
                          type="button"
                          disabled={scenarioAction !== null}
                          onClick={() => void runScenarioAction('verify')}
                        >
                          {scenarioAction === 'verify' ? 'Running...' : 'Verify Scenario'}
                        </button>
                        <button
                          className="button button--ghost"
                          type="button"
                          disabled={scenarioAction !== null}
                          onClick={() => void runScenarioAction('recover')}
                        >
                          {scenarioAction === 'recover' ? 'Running...' : 'Recover Baseline'}
                        </button>
                        <Link
                          to="/policies"
                          className="button button--ghost"
                          style={{ textDecoration: 'none' }}
                        >
                          Open Policy Center
                        </Link>
                        <Link
                          to="/flows"
                          className="button button--ghost"
                          style={{ textDecoration: 'none' }}
                        >
                          Open Flows Page
                        </Link>
                      </div>
                    </div>

                    {actionResult && actionResult.policy.id === selectedScenario.policyId ? (
                      <div className="metadata-item" style={{ marginTop: '16px' }}>
                        <span className="metadata-label">Latest Action Result</span>
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

                    <div className="metadata-item" style={{ marginTop: '16px' }}>
                      <span className="metadata-label">Recent Policy Events</span>
                      {selectedScenarioEvents.length === 0 ? (
                        <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                          No recent events recorded for this scenario policy yet.
                        </p>
                      ) : (
                        <div
                          style={{
                            marginTop: '12px',
                            display: 'grid',
                            gap: '10px',
                          }}
                        >
                          {selectedScenarioEvents.map((event: PolicyEventRecord, index) => (
                            <div
                              key={event.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '12px',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                paddingBottom: '10px',
                                borderBottom:
                                  index === selectedScenarioEvents.length - 1
                                    ? 'none'
                                    : '1px solid var(--border-soft)',
                              }}
                            >
                              <div className="cell-stack">
                                <strong>{formatLabel(event.action)}</strong>
                                <span className="cell-muted">
                                  {formatDateTime(event.timestamp)} · {event.message}
                                </span>
                              </div>
                              <StatusBadge
                                label={formatState(event.compliance)}
                                tone={getComplianceTone(event.compliance)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : null}
              </Panel>

              <Panel
                title="Speaker Assist"
                description="Short speaking cues for the selected scenario so the operator can narrate state, evidence, drift, and recovery without leaving the screen."
              >
                {selectedPolicy ? (
                  <>
                    <div className="metadata-grid">
                      <div className="metadata-item">
                        <span className="metadata-label">What Policy Is Demonstrated</span>
                        <p className="entity-list-meta">
                          {selectedScenario.speakerAssist.policy}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <span className="metadata-label">Desired State Means</span>
                        <p className="entity-list-meta">
                          {selectedScenario.speakerAssist.desiredState}
                        </p>
                      </div>
                      <div className="metadata-item">
                        <span className="metadata-label">Evidence Proves</span>
                        <p className="entity-list-meta">
                          {selectedScenario.speakerAssist.evidence}
                        </p>
                      </div>
                    </div>

                    <div className="content-grid content-grid--two" style={{ marginTop: '16px' }}>
                      <div className="metadata-item">
                        <span className="metadata-label">What Drift Would Look Like</span>
                        <p className="entity-list-meta">
                          {selectedScenario.speakerAssist.drift}
                        </p>
                        <div style={{ marginTop: '12px' }}>
                          <StatusBadge
                            label={formatState(selectedPolicy.compliance)}
                            tone={getComplianceTone(selectedPolicy.compliance)}
                          />
                        </div>
                      </div>

                      <div className="metadata-item">
                        <span className="metadata-label">How Recovery Works</span>
                        <p className="entity-list-meta">
                          {selectedScenario.speakerAssist.recovery}
                        </p>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          {selectedScenario.rollbackNote}
                        </p>
                      </div>
                    </div>

                    <div className="metadata-item" style={{ marginTop: '16px' }}>
                      <span className="metadata-label">Narration Anchor</span>
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        Desired state is currently{' '}
                        <strong>{formatState(selectedPolicy.desired_state)}</strong>, live
                        state is <strong>{formatState(selectedPolicy.live_state)}</strong>,
                        and the latest evidence summary says:{' '}
                        <strong>{latestEvidence?.summary ?? 'no evidence snapshot yet'}</strong>.
                      </p>
                      <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                        Verification status is{' '}
                        <strong>
                          {latestVerification?.summary ?? 'not yet established for this run'}
                        </strong>
                        .
                      </p>
                    </div>
                  </>
                ) : (
                  <EmptyState
                    title="No scenario selected"
                    description="Choose a scenario to load live speaker notes and operator cues."
                  />
                )}
              </Panel>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
