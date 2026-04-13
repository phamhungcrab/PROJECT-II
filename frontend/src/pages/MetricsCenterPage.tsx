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
import type {
  DemoPolicyStatusResponse,
  PolicyDriftSummaryResponse,
  PolicyEvidenceRecord,
  PolicyEventsResponse,
  PolicyRecord,
  PolicySummaryResponse,
} from '../types/policy'
import type {
  HealthResponse,
  InventoryNodesResponse,
  OvsLiveFlowsResponse,
  TopologySummaryResponse,
} from '../types/sdn'
import {
  buildOperationalAlerts,
  getAlertSeverityTone,
  summarizeAlerts,
} from '../utils/alertCenter'
import { formatDateTime, formatLabel, formatNumber } from '../utils/formatters'

type MetricTone = 'accent' | 'success' | 'warning' | 'danger' | 'neutral'

interface PolicyCoverageSnapshot {
  policy: PolicyRecord
  evidenceCount: number | null
  latestEvidence: PolicyEvidenceRecord | null
  evidenceError: string | null
  verificationCount: number | null
  latestVerification: PolicyEvidenceRecord | null
  verificationError: string | null
}

interface MetricsCenterData {
  checkedAt: string
  health: HealthResponse | null
  healthError: string | null
  topology: TopologySummaryResponse | null
  topologyError: string | null
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
  policyCoverage: PolicyCoverageSnapshot[]
}

interface MetricBarProps {
  label: string
  helper: string
  value: string
  ratio: number | null
  tone: MetricTone
}

interface SegmentedBarSegment {
  label: string
  value: number
  tone: MetricTone
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

function getRatio(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
) {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator <= 0
  ) {
    return null
  }

  return Math.max(0, Math.min(1, numerator / denominator))
}

function formatPercent(ratio: number | null) {
  if (ratio === null) {
    return 'N/A'
  }

  return `${Math.round(ratio * 100)}%`
}

function getPercentWidth(ratio: number | null) {
  if (ratio === null) {
    return '0%'
  }

  return `${Math.round(ratio * 100)}%`
}

function getResultTone(result: string) {
  if (result === 'success') {
    return 'success' as const
  }

  if (result === 'failed') {
    return 'danger' as const
  }

  return 'neutral' as const
}

function isWithinHours(timestamp: string | null | undefined, hours: number) {
  if (!timestamp) {
    return false
  }

  const parsedTimestamp = new Date(timestamp)
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return false
  }

  return Date.now() - parsedTimestamp.getTime() <= hours * 60 * 60 * 1000
}

function formatMetricNumber(value: number | null | undefined) {
  return value === null || value === undefined ? 'N/A' : formatNumber(value)
}

function MetricBar({ label, helper, value, ratio, tone }: MetricBarProps) {
  return (
    <div className="metric-bar-card">
      <div className="metric-bar-header">
        <div>
          <strong className="metric-bar-title">{label}</strong>
          <p className="metric-bar-helper">{helper}</p>
        </div>
        <span className="metric-bar-value">{value}</span>
      </div>
      <div className="metric-bar-track" aria-hidden="true">
        <div
          className={`metric-bar-fill metric-bar-fill--${tone}`}
          style={{ width: getPercentWidth(ratio) }}
        />
      </div>
    </div>
  )
}

function SegmentedBar({ segments }: { segments: SegmentedBarSegment[] }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)

  return (
    <div className="metrics-segmented">
      <div className="metrics-segmented-bar" aria-hidden="true">
        {segments.map((segment) => (
          <div
            key={segment.label}
            className={`metrics-segment metrics-segment--${segment.tone}`}
            style={{
              width:
                total > 0 ? `${Math.max((segment.value / total) * 100, 0)}%` : '0%',
            }}
          />
        ))}
      </div>
      <div className="chip-row" style={{ marginTop: '12px' }}>
        {segments.map((segment) => (
          <span key={segment.label} className="chip">
            {segment.label}: {formatNumber(segment.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function MetricsCenterPage() {
  const { defenseMode } = useDefenseMode()
  const { data, isLoading, reload } = useApiResource<MetricsCenterData>(async () => {
    const [
      health,
      topology,
      inventory,
      policySummary,
      policyEvents,
      driftSummary,
      demoStatus,
      ovsEvidence,
    ] = await Promise.all([
      loadSource(() => sdnApi.getHealth()),
      loadSource(() => sdnApi.getTopologySummary()),
      loadSource(() => sdnApi.getInventoryNodes()),
      loadSource(() => policyApi.getSummary()),
      loadSource(() => policyApi.getEvents()),
      loadSource(() => policyApi.getDriftSummary()),
      loadSource(() => policyApi.getDemoStatus()),
      loadSource(() => sdnApi.getOvsFlows()),
    ])

    const policyCoverage = policySummary.data
      ? await Promise.all(
          policySummary.data.policies.map(async (policy) => {
            const [evidence, verifications] = await Promise.all([
              loadSource(() => policyApi.getEvidence(policy.id)),
              loadSource(() => policyApi.getVerifications(policy.id)),
            ])

            return {
              policy,
              evidenceCount: evidence.data?.count ?? null,
              latestEvidence: evidence.data?.evidence[0] ?? null,
              evidenceError: evidence.error,
              verificationCount: verifications.data?.count ?? null,
              latestVerification: verifications.data?.verifications[0] ?? null,
              verificationError: verifications.error,
            }
          }),
        )
      : []

    return {
      checkedAt: new Date().toISOString(),
      health: health.data,
      healthError: health.error,
      topology: topology.data,
      topologyError: topology.error,
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
      policyCoverage,
    }
  }, [])

  const alerts = buildOperationalAlerts({
    checkedAt: data?.checkedAt ?? new Date().toISOString(),
    health: data?.health,
    healthError: data?.healthError,
    inventory: data?.inventory,
    policySummary: data?.policySummary,
    policySummaryError: data?.policySummaryError,
    driftSummary: data?.driftSummary,
    driftError: data?.driftError,
    demoStatus: data?.demoStatus,
    demoStatusError: data?.demoStatusError,
    ovsEvidence: data?.ovsEvidence,
    ovsEvidenceError: data?.ovsEvidenceError,
  })
  const alertSummary = summarizeAlerts(alerts)
  const policyCoverage = data?.policyCoverage ?? []
  const totalPolicies =
    data?.policySummary?.total_policies ?? (policyCoverage.length > 0 ? policyCoverage.length : null)
  const enabledPolicies = data?.policySummary?.enabled_policies ?? null
  const liveEnforcedPolicies = data?.policySummary?.live_enforced_policies ?? null
  const compliantPolicies = data?.policySummary?.compliant_policies ?? null
  const partialPolicies = data?.policySummary?.partial_policies ?? null
  const driftPolicies =
    data?.driftSummary?.drift_count ?? data?.policySummary?.drift_policies ?? null
  const unknownPolicies =
    data?.driftSummary?.unknown_count ?? data?.policySummary?.unknown_policies ?? null
  const disabledPolicies =
    totalPolicies !== null && enabledPolicies !== null
      ? Math.max(totalPolicies - enabledPolicies, 0)
      : null
  const complianceRatio = getRatio(compliantPolicies, totalPolicies)
  const driftRatio = getRatio(driftPolicies, totalPolicies)

  const evidenceReadablePolicies = policyCoverage.filter(
    (snapshot) => snapshot.evidenceCount !== null,
  )
  const evidenceBackedPolicies = evidenceReadablePolicies.filter(
    (snapshot) => (snapshot.evidenceCount ?? 0) > 0,
  )
  const evidenceCoverageRatio = getRatio(
    evidenceBackedPolicies.length,
    evidenceReadablePolicies.length,
  )
  const totalEvidenceSnapshots = evidenceReadablePolicies.reduce(
    (sum, snapshot) => sum + (snapshot.evidenceCount ?? 0),
    0,
  )
  const latestEvidenceTimestamp =
    evidenceBackedPolicies
      .map((snapshot) => snapshot.latestEvidence?.timestamp ?? null)
      .filter((timestamp): timestamp is string => Boolean(timestamp))
      .sort((left, right) => right.localeCompare(left))[0] ?? null
  const totalRelevantEvidenceFlows = evidenceBackedPolicies.reduce(
    (sum, snapshot) => sum + (snapshot.latestEvidence?.flow_count ?? 0),
    0,
  )

  const verificationReadablePolicies = policyCoverage.filter(
    (snapshot) => snapshot.verificationCount !== null,
  )
  const verifiedPolicies = verificationReadablePolicies.filter(
    (snapshot) => (snapshot.verificationCount ?? 0) > 0,
  )
  const verificationCoverageRatio = getRatio(
    verifiedPolicies.length,
    verificationReadablePolicies.length,
  )
  const totalVerificationRuns = verificationReadablePolicies.reduce(
    (sum, snapshot) => sum + (snapshot.verificationCount ?? 0),
    0,
  )
  const latestVerificationTimestamp =
    verifiedPolicies
      .map((snapshot) => snapshot.latestVerification?.timestamp ?? null)
      .filter((timestamp): timestamp is string => Boolean(timestamp))
      .sort((left, right) => right.localeCompare(left))[0] ?? null

  const policyEvents = [...(data?.policyEvents?.events ?? [])].sort((left, right) =>
    right.timestamp.localeCompare(left.timestamp),
  )
  const recentPolicyEvents = policyEvents.slice(0, 6)
  const recentControlActivity = policyEvents.filter((event) =>
    isWithinHours(event.timestamp, 24),
  ).length
  const successfulPolicyEvents = policyEvents.filter(
    (event) => event.result === 'success',
  ).length
  const eventSuccessRatio = getRatio(successfulPolicyEvents, policyEvents.length)
  const eventActionCounts = Object.entries(
    policyEvents.reduce<Record<string, number>>((counts, event) => {
      const key = event.action || 'unknown'
      counts[key] = (counts[key] ?? 0) + 1
      return counts
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)

  const alertTone =
    alertSummary.critical_count > 0
      ? 'danger'
      : alertSummary.active_alerts > 0
        ? 'warning'
        : 'success'
  const controllerReachable = data?.health?.status === 'ok'
  const ovsPolicyFlows =
    data?.ovsEvidence?.flows.filter((flow) => flow.flow_type === 'policy').length ?? null
  const ovsBaseFlows =
    data?.ovsEvidence?.flows.filter((flow) => flow.flow_type === 'base').length ?? null
  const sourceIssues = [
    data?.healthError ? 'controller health data is unavailable' : null,
    data?.topologyError ? 'topology summary is unavailable' : null,
    data?.inventoryError ? 'inventory state is unavailable' : null,
    data?.policySummaryError ? 'policy summary is unavailable' : null,
    data?.policyEventsError ? 'policy event history is unavailable' : null,
    data?.driftError ? 'drift summary is unavailable' : null,
    data?.demoStatusError ? 'demo policy status is unavailable' : null,
    data?.ovsEvidenceError ? 'OVS live evidence is unavailable' : null,
  ].filter((issue): issue is string => Boolean(issue))
  const evidenceErrorCount = policyCoverage.filter(
    (snapshot) => snapshot.evidenceError,
  ).length
  const verificationErrorCount = policyCoverage.filter(
    (snapshot) => snapshot.verificationError,
  ).length

  const complianceSegments: SegmentedBarSegment[] = [
    {
      label: 'Compliant',
      value: compliantPolicies ?? 0,
      tone: 'success',
    },
    {
      label: 'Partial',
      value: partialPolicies ?? 0,
      tone: 'warning',
    },
    {
      label: 'Drift',
      value: driftPolicies ?? 0,
      tone: 'danger',
    },
    {
      label: 'Unknown',
      value: unknownPolicies ?? 0,
      tone: 'neutral',
    },
  ]
  const actionSegments: SegmentedBarSegment[] = eventActionCounts.map(
    ([action, count], index) => ({
      label: formatLabel(action),
      value: count,
      tone:
        index === 0
          ? 'accent'
          : index === 1
            ? 'success'
            : index === 2
              ? 'warning'
              : 'neutral',
    }),
  )
  const alertSegments: SegmentedBarSegment[] = [
    {
      label: 'Critical',
      value: alertSummary.critical_count,
      tone: 'danger',
    },
    {
      label: 'Warning',
      value: alertSummary.warning_count,
      tone: 'warning',
    },
    {
      label: 'Info',
      value: alertSummary.info_count,
      tone: 'neutral',
    },
  ]

  const readinessItems = [
    {
      label: 'Control plane telemetry',
      badge: controllerReachable ? 'Reachable' : 'Check',
      tone: controllerReachable ? 'success' : 'warning',
      summary: data?.health
        ? `Health, topology, and inventory APIs are readable for the current evaluation snapshot on ${formatDateTime(
            data.checkedAt,
          )}.`
        : data?.healthError ?? 'Controller health could not be confirmed.',
    },
    {
      label: 'Policy lifecycle tracking',
      badge: data?.policySummary ? 'Tracked' : 'Check',
      tone: data?.policySummary ? 'success' : 'warning',
      summary: data?.policySummary
        ? `${formatNumber(totalPolicies)} policy objects and ${formatNumber(
            data.policyEvents?.count ?? 0,
          )} recorded policy events are available for evaluation.`
        : data?.policySummaryError ?? 'Policy inventory could not be loaded.',
    },
    {
      label: 'Verification history',
      badge:
        totalVerificationRuns > 0
          ? 'Recorded'
          : verificationReadablePolicies.length > 0
            ? 'Limited'
            : 'Check',
      tone:
        totalVerificationRuns > 0
          ? 'success'
          : verificationReadablePolicies.length > 0
            ? 'warning'
            : 'danger',
      summary:
        verificationReadablePolicies.length > 0
          ? `${formatNumber(totalVerificationRuns)} verification runs are recorded across ${formatNumber(
              verifiedPolicies.length,
            )} policies with verification history.`
          : 'Verification history endpoints did not yield readable policy coverage.',
    },
    {
      label: 'Evidence-backed policies',
      badge:
        evidenceBackedPolicies.length > 0
          ? 'Observed'
          : evidenceReadablePolicies.length > 0
            ? 'Limited'
            : 'Check',
      tone:
        evidenceBackedPolicies.length > 0
          ? 'success'
          : evidenceReadablePolicies.length > 0
            ? 'warning'
            : 'danger',
      summary:
        evidenceReadablePolicies.length > 0
          ? `${formatNumber(evidenceBackedPolicies.length)} of ${formatNumber(
              evidenceReadablePolicies.length,
            )} policies currently have evidence snapshots, with ${formatNumber(
              totalRelevantEvidenceFlows,
            )} relevant flows in the latest recorded evidence set.`
          : 'Evidence endpoints did not yield readable policy coverage.',
    },
    {
      label: 'Fault quantification',
      badge:
        data?.driftSummary && alerts.length > 0
          ? 'Quantified'
          : data?.driftSummary || alerts.length > 0
            ? 'Partial'
            : 'Check',
      tone:
        data?.driftSummary && alerts.length > 0
          ? 'success'
          : data?.driftSummary || alerts.length > 0
            ? 'warning'
            : 'danger',
      summary:
        data?.driftSummary && alerts.length > 0
          ? `${formatNumber(driftPolicies)} drifted policies and ${formatNumber(
              alertSummary.active_alerts,
            )} active alerts can be quantified in the current snapshot.`
          : 'Drift and fault data is only partially available in the current snapshot.',
    },
  ] as const

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Evaluation / Metrics Center</h2>
          <p className="section-copy">
            Compact evaluation view for policy lifecycle activity, verification
            coverage, evidence-backed enforcement, and quantified drift or fault
            conditions across the current SDN management environment.
          </p>
        </div>

        <div className="hero-actions">
          <div className="meta-chip">
            <span>Snapshot</span>
            <strong>{formatDateTime(data?.checkedAt)}</strong>
          </div>
          <button className="button" type="button" onClick={reload} disabled={isLoading}>
            Refresh metrics center
          </button>
        </div>
      </section>

      {isLoading && !data ? (
        <LoadingState
          label="Loading evaluation metrics..."
          hint="Preparing grounded policy, evidence, verification, and alert metrics."
          variant="cards"
        />
      ) : null}

      {data ? (
        <>
          {sourceIssues.length > 0 || evidenceErrorCount > 0 || verificationErrorCount > 0 ? (
            <div className="notice notice--warning">
              Metrics Center is using partial data. Source gaps:{' '}
              {[...sourceIssues]
                .concat(
                  evidenceErrorCount > 0
                    ? `evidence coverage unavailable for ${formatNumber(evidenceErrorCount)} policies`
                    : [],
                )
                .concat(
                  verificationErrorCount > 0
                    ? `verification coverage unavailable for ${formatNumber(
                        verificationErrorCount,
                      )} policies`
                    : [],
                )
                .join('; ')}
              .
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Total Policies"
              value={formatMetricNumber(totalPolicies)}
              helper="Current policy objects known to Policy Center"
              tone="accent"
            />
            <StatCard
              label="Enabled Policies"
              value={formatMetricNumber(enabledPolicies)}
              helper="Desired enabled policies in the current inventory"
            />
            <StatCard
              label="Verification Runs"
              value={formatMetricNumber(totalVerificationRuns)}
              helper={`Based on ${formatMetricNumber(
                verificationReadablePolicies.length,
              )} policies with readable verification history`}
              tone="success"
            />
            <StatCard
              label="Compliance Rate"
              value={formatPercent(complianceRatio)}
              helper={`Based on ${formatMetricNumber(totalPolicies)} current policy objects`}
              tone={complianceRatio === 1 ? 'success' : 'default'}
            />
            <StatCard
              label="Drift Rate"
              value={formatPercent(driftRatio)}
              helper={`Based on ${formatMetricNumber(totalPolicies)} current policy objects`}
            />
            <StatCard
              label="Evidence Coverage"
              value={formatPercent(evidenceCoverageRatio)}
              helper={`${formatMetricNumber(evidenceBackedPolicies.length)} of ${formatMetricNumber(
                evidenceReadablePolicies.length,
              )} policies currently have evidence snapshots`}
              tone={evidenceBackedPolicies.length > 0 ? 'success' : 'default'}
            />
            <StatCard
              label="Active Alerts"
              value={formatNumber(alertSummary.active_alerts)}
              helper={`${formatNumber(alertSummary.total_alerts)} total alert signals in the current snapshot`}
            />
            <StatCard
              label="Recent Control Activity"
              value={formatNumber(recentControlActivity)}
              helper="Policy events recorded in the last 24 hours"
            />
          </div>

          <div className="content-grid content-grid--two">
            <Panel
              title="Policy Lifecycle Metrics"
              description="Lifecycle metrics are based on the current policy inventory and recorded policy events from Policy Center."
              className={defenseMode ? 'panel--defense-primary' : undefined}
              action={
                <StatusBadge
                  label={formatNumber(policyEvents.length)}
                  tone={policyEvents.length > 0 ? 'success' : 'warning'}
                />
              }
            >
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Tracked policies</span>
                  <strong>{formatMetricNumber(totalPolicies)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Enabled</span>
                  <strong>{formatMetricNumber(enabledPolicies)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Live enforced</span>
                  <strong>{formatMetricNumber(liveEnforcedPolicies)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Recent control activity</span>
                  <strong>{formatNumber(recentControlActivity)}</strong>
                </div>
              </div>

              <div className="metrics-stack" style={{ marginTop: '16px' }}>
                <MetricBar
                  label="Enabled policy ratio"
                  helper={`Enabled policies relative to ${formatMetricNumber(totalPolicies)} known policy objects.`}
                  value={
                    totalPolicies !== null && enabledPolicies !== null
                      ? `${formatNumber(enabledPolicies)} / ${formatNumber(totalPolicies)}`
                      : 'N/A'
                  }
                  ratio={getRatio(enabledPolicies, totalPolicies)}
                  tone={enabledPolicies && enabledPolicies > 0 ? 'success' : 'neutral'}
                />
                <MetricBar
                  label="Successful control activity ratio"
                  helper="Success ratio based on recorded policy events in the current backend store."
                  value={
                    policyEvents.length > 0
                      ? `${formatNumber(successfulPolicyEvents)} / ${formatNumber(
                          policyEvents.length,
                        )}`
                      : 'N/A'
                  }
                  ratio={eventSuccessRatio}
                  tone={successfulPolicyEvents === policyEvents.length ? 'success' : 'warning'}
                />
              </div>

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Desired State Distribution</span>
                <SegmentedBar
                  segments={[
                    {
                      label: 'Enabled',
                      value: enabledPolicies ?? 0,
                      tone: 'success',
                    },
                    {
                      label: 'Disabled',
                      value: disabledPolicies ?? 0,
                      tone: 'neutral',
                    },
                  ]}
                />
                <p className="metrics-definition">
                  Enabled ratio is based on current desired policy state, not on inferred
                  controller intent.
                </p>
              </div>

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Recorded Control Actions</span>
                {actionSegments.length > 0 ? (
                  <>
                    <SegmentedBar segments={actionSegments} />
                    <p className="metrics-definition">
                      Action distribution reflects recorded policy events such as apply,
                      verify, rollback, and create.
                    </p>
                  </>
                ) : (
                  <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                    No policy events have been recorded yet.
                  </p>
                )}
              </div>
            </Panel>

            <Panel
              title="Verification & Compliance Metrics"
              description="Verification metrics are based on recorded verification history and current compliance counts returned by Policy Center."
              className={defenseMode ? 'panel--defense-primary' : undefined}
              action={
                <StatusBadge
                  label={formatPercent(complianceRatio)}
                  tone={complianceRatio === 1 ? 'success' : 'warning'}
                />
              }
            >
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Total verification runs</span>
                  <strong>{formatMetricNumber(totalVerificationRuns)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Policies with verification history</span>
                  <strong>{formatNumber(verifiedPolicies.length)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Compliant policies</span>
                  <strong>{formatMetricNumber(compliantPolicies)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Latest verification</span>
                  <strong>{formatDateTime(latestVerificationTimestamp)}</strong>
                </div>
              </div>

              <div className="metrics-stack" style={{ marginTop: '16px' }}>
                <MetricBar
                  label="Current compliance ratio"
                  helper="Compliant policies divided by the current known policy inventory."
                  value={
                    totalPolicies !== null && compliantPolicies !== null
                      ? `${formatNumber(compliantPolicies)} / ${formatNumber(totalPolicies)}`
                      : 'N/A'
                  }
                  ratio={complianceRatio}
                  tone={complianceRatio === 1 ? 'success' : 'warning'}
                />
                <MetricBar
                  label="Verification coverage"
                  helper={`Policies with at least one verification run across ${formatMetricNumber(
                    verificationReadablePolicies.length,
                  )} readable verification histories.`}
                  value={`${formatNumber(verifiedPolicies.length)} / ${formatNumber(
                    verificationReadablePolicies.length,
                  )}`}
                  ratio={verificationCoverageRatio}
                  tone={verifiedPolicies.length > 0 ? 'success' : 'warning'}
                />
              </div>

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Compliance Distribution</span>
                <SegmentedBar segments={complianceSegments} />
                <p className="metrics-definition">
                  Compliance rate is based on the backend&apos;s current policy object
                  summary, including compliant, partial, drift, and unknown states.
                </p>
              </div>
            </Panel>
          </div>

          <div className="content-grid content-grid--two">
            <Panel
              title="Evidence Coverage"
              description="Evidence coverage is based on per-policy evidence snapshots and the latest OVS live flow visibility."
              action={
                <StatusBadge
                  label={formatPercent(evidenceCoverageRatio)}
                  tone={evidenceBackedPolicies.length > 0 ? 'success' : 'warning'}
                />
              }
            >
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Evidence-backed policies</span>
                  <strong>{formatNumber(evidenceBackedPolicies.length)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Total evidence snapshots</span>
                  <strong>{formatMetricNumber(totalEvidenceSnapshots)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Relevant flows in latest evidence</span>
                  <strong>{formatMetricNumber(totalRelevantEvidenceFlows)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Latest evidence</span>
                  <strong>{formatDateTime(latestEvidenceTimestamp)}</strong>
                </div>
              </div>

              <div className="metrics-stack" style={{ marginTop: '16px' }}>
                <MetricBar
                  label="Evidence coverage"
                  helper={`Policies with at least one evidence snapshot across ${formatMetricNumber(
                    evidenceReadablePolicies.length,
                  )} readable evidence histories.`}
                  value={`${formatNumber(evidenceBackedPolicies.length)} / ${formatNumber(
                    evidenceReadablePolicies.length,
                  )}`}
                  ratio={evidenceCoverageRatio}
                  tone={evidenceBackedPolicies.length > 0 ? 'success' : 'warning'}
                />
              </div>

              <div className="metadata-grid" style={{ marginTop: '16px' }}>
                <div className="metadata-item">
                  <span className="metadata-label">Current OVS Policy Flows</span>
                  <strong className="metadata-value">{formatMetricNumber(ovsPolicyFlows)}</strong>
                  <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                    Policy flows currently visible from the OVS evidence endpoint.
                  </p>
                </div>

                <div className="metadata-item">
                  <span className="metadata-label">Current OVS Base Flows</span>
                  <strong className="metadata-value">{formatMetricNumber(ovsBaseFlows)}</strong>
                  <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                    Base forwarding flows currently visible from the OVS evidence endpoint.
                  </p>
                </div>

                <div className="metadata-item">
                  <span className="metadata-label">Coverage Scope</span>
                  <strong className="metadata-value">
                    {formatNumber(evidenceReadablePolicies.length)} readable histories
                  </strong>
                  <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                    Evidence coverage is counted only where the evidence history endpoint was
                    readable.
                  </p>
                </div>
              </div>

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Policy Evidence Snapshot</span>
                {policyCoverage.length > 0 ? (
                  <div className="table-shell" style={{ marginTop: '12px' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Policy</th>
                          <th>Evidence</th>
                          <th>Verification</th>
                          <th>Latest evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {policyCoverage.map((snapshot) => (
                          <tr key={snapshot.policy.id}>
                            <td>
                              <div className="cell-stack">
                                <strong>{snapshot.policy.name}</strong>
                                <span className="cell-muted mono">{snapshot.policy.id}</span>
                              </div>
                            </td>
                            <td>
                              {snapshot.evidenceCount === null
                                ? 'Unavailable'
                                : snapshot.evidenceCount > 0
                                  ? `${formatNumber(snapshot.evidenceCount)} snapshot(s)`
                                  : 'No evidence yet'}
                            </td>
                            <td>
                              {snapshot.verificationCount === null
                                ? 'Unavailable'
                                : snapshot.verificationCount > 0
                                  ? `${formatNumber(snapshot.verificationCount)} run(s)`
                                  : 'No verification yet'}
                            </td>
                            <td>{snapshot.latestEvidence?.summary ?? 'No evidence summary recorded.'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                    Policy-specific evidence coverage will appear here when policy inventory
                    data is available.
                  </p>
                )}
              </div>
            </Panel>

            <Panel
              title="Drift / Fault Metrics"
              description="Fault metrics combine Policy Center drift summary with the existing operational alert inputs and alert synthesis."
              action={
                <StatusBadge
                  label={`${formatNumber(alertSummary.active_alerts)} active`}
                  tone={alertTone}
                />
              }
            >
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Drifted policies</span>
                  <strong>{formatMetricNumber(driftPolicies)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Active alerts</span>
                  <strong>{formatNumber(alertSummary.active_alerts)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Critical alerts</span>
                  <strong>{formatNumber(alertSummary.critical_count)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Controller health</span>
                  <strong>{data?.health?.status ? formatLabel(data.health.status) : 'Unavailable'}</strong>
                </div>
              </div>

              <div className="metrics-stack" style={{ marginTop: '16px' }}>
                <MetricBar
                  label="Active drift ratio"
                  helper="Drifted policies divided by the current known policy inventory."
                  value={
                    totalPolicies !== null && driftPolicies !== null
                      ? `${formatNumber(driftPolicies)} / ${formatNumber(totalPolicies)}`
                      : 'N/A'
                  }
                  ratio={driftRatio}
                  tone={driftPolicies && driftPolicies > 0 ? 'danger' : 'success'}
                />
              </div>

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Alert Severity Distribution</span>
                <SegmentedBar segments={alertSegments} />
                <p className="metrics-definition">
                  Alert counts are derived from the existing operational alert model used by
                  Alert Center.
                </p>
              </div>

              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Top Active Signals</span>
                {alerts.length > 0 ? (
                  <ul className="entity-list">
                    {alerts.slice(0, 4).map((alert) => (
                      <li key={alert.id} className="entity-list-item">
                        <div>
                          <div className="entity-list-heading">
                            <strong>{alert.title}</strong>
                            <StatusBadge
                              label={formatLabel(alert.severity)}
                              tone={getAlertSeverityTone(alert.severity)}
                            />
                          </div>
                          <p className="entity-list-meta">
                            {alert.summary}
                          </p>
                        </div>
                        <span className="entity-list-trailing">{alert.source}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                    No alert signals are currently recorded for this snapshot.
                  </p>
                )}
              </div>
            </Panel>
          </div>

          <div className="content-grid content-grid--two">
            <Panel
              title="Recent Activity Snapshot"
              description="Recent control activity is based on recorded policy events, with the most recent entries shown first."
              action={
                <StatusBadge
                  label={`${formatNumber(recentControlActivity)} in 24h`}
                  tone={recentControlActivity > 0 ? 'success' : 'neutral'}
                />
              }
            >
              <div className="metadata-grid">
                <div className="metadata-item">
                  <span className="metadata-label">Recorded policy events</span>
                  <strong className="metadata-value">
                    {formatMetricNumber(data?.policyEvents?.count ?? null)}
                  </strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Recent control activity</span>
                  <strong className="metadata-value">{formatNumber(recentControlActivity)}</strong>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Current evaluation snapshot</span>
                  <strong className="metadata-value">{formatDateTime(data?.checkedAt)}</strong>
                </div>
              </div>

              {recentPolicyEvents.length > 0 ? (
                <ul className="entity-list" style={{ marginTop: '16px' }}>
                  {recentPolicyEvents.map((event) => (
                    <li key={event.id} className="entity-list-item">
                      <div>
                        <div className="entity-list-heading">
                          <strong>{event.policy_name}</strong>
                          <StatusBadge
                            label={formatLabel(event.action)}
                            tone={getResultTone(event.result)}
                          />
                        </div>
                        <p className="entity-list-meta">
                          {event.message}
                        </p>
                        <p className="entity-list-meta">
                          Compliance {formatLabel(event.compliance)} · Live state{' '}
                          {formatLabel(event.live_state)}
                        </p>
                      </div>
                      <span className="entity-list-trailing">
                        {formatDateTime(event.timestamp)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ marginTop: '16px' }}>
                  <EmptyState
                    title="No recent control activity"
                    description="Policy Center has not recorded recent policy events for this snapshot."
                    eyebrow="Activity"
                  />
                </div>
              )}
            </Panel>

            <Panel
              title="Product Readiness Snapshot"
              description="This snapshot helps explain that the platform measures policy state, verification history, evidence coverage, and quantified drift or fault conditions."
              className={defenseMode ? 'panel--defense-primary' : undefined}
              action={
                <StatusBadge
                  label={controllerReachable ? 'Measured' : 'Partial'}
                  tone={controllerReachable ? 'success' : 'warning'}
                />
              }
            >
              <div className="metadata-item">
                <span className="metadata-label">Evaluation Positioning</span>
                <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                  The platform does not only control policy state. It also quantifies
                  compliance, verification history, evidence coverage, and fault or drift
                  conditions using the currently available backend and switch evidence.
                </p>
              </div>

              <ul className="entity-list" style={{ marginTop: '16px' }}>
                {readinessItems.map((item) => (
                  <li key={item.label} className="entity-list-item">
                    <div>
                      <div className="entity-list-heading">
                        <strong>{item.label}</strong>
                        <StatusBadge
                          label={item.badge}
                          tone={item.tone}
                        />
                      </div>
                      <p className="entity-list-meta">{item.summary}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="form-actions" style={{ marginTop: '16px' }}>
                <Link
                  className="button button--ghost"
                  to="/dashboard"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Open Dashboard
                </Link>
                <Link
                  className="button button--ghost"
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
                  className="button button--ghost"
                  to="/alert-center"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                >
                  Open Alert Center
                </Link>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  )
}
