import type { AlertRecord, AlertSeverity } from '../types/alerts'
import type {
  DemoPolicyStatusResponse,
  PolicyCompliance,
  PolicyDesiredState,
  PolicyDriftSummaryResponse,
  PolicyEvidenceRecord,
  PolicyEventRecord,
  PolicyLiveState,
  PolicyRecord,
} from '../types/policy'
import { formatLabel } from './formatters'

export type OperationsTimelineCategory =
  | 'control'
  | 'verification'
  | 'evidence'
  | 'drift'
  | 'alert'
  | 'recovery'

export type OperationsTimelineImportance = 'info' | 'warning' | 'critical'

export interface OperationsTimelineBadge {
  label: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
}

export interface OperationsTimelineItem {
  id: string
  timestamp: string
  category: OperationsTimelineCategory
  importance: OperationsTimelineImportance
  title: string
  summary: string
  related_policy_id: string | null
  related_policy_name: string | null
  related_area: string
  related_path: string | null
  source: string
  derived: boolean
  supporting_badges: OperationsTimelineBadge[]
  details?: string[]
}

export interface PolicyHistorySnapshot {
  policy: PolicyRecord
  evidence: PolicyEvidenceRecord[]
  evidenceError: string | null
  verifications: PolicyEvidenceRecord[]
  verificationError: string | null
}

interface BuildOperationsTimelineInput {
  checkedAt: string
  policyEvents: PolicyEventRecord[]
  policyHistory: PolicyHistorySnapshot[]
  driftSummary: PolicyDriftSummaryResponse | null
  alerts: AlertRecord[]
  demoStatus: DemoPolicyStatusResponse | null
}

function getToneForImportance(
  importance: OperationsTimelineImportance,
): OperationsTimelineBadge['tone'] {
  if (importance === 'critical') {
    return 'danger'
  }

  if (importance === 'warning') {
    return 'warning'
  }

  return 'neutral'
}

function getToneForSeverity(
  severity: AlertSeverity,
): OperationsTimelineBadge['tone'] {
  if (severity === 'critical') {
    return 'danger'
  }

  if (severity === 'warning') {
    return 'warning'
  }

  return 'neutral'
}

function getToneForCompliance(
  compliance: PolicyCompliance,
): OperationsTimelineBadge['tone'] {
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

function getToneForLiveState(
  liveState: PolicyLiveState,
): OperationsTimelineBadge['tone'] {
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

function getImportanceFromCompliance(
  compliance: PolicyCompliance,
): OperationsTimelineImportance {
  if (compliance === 'DRIFT') {
    return 'critical'
  }

  if (compliance === 'PARTIAL') {
    return 'warning'
  }

  return 'info'
}

function getImportanceFromEvent(
  event: PolicyEventRecord,
): OperationsTimelineImportance {
  if (event.result === 'failed') {
    return 'critical'
  }

  if (event.compliance === 'DRIFT' || event.compliance === 'PARTIAL') {
    return 'warning'
  }

  return 'info'
}

function getActionCategory(action: string): OperationsTimelineCategory {
  const normalizedAction = action.toLowerCase()

  if (normalizedAction.includes('verify')) {
    return 'verification'
  }

  if (
    normalizedAction.includes('recover') ||
    normalizedAction.includes('baseline') ||
    normalizedAction.includes('rollback')
  ) {
    return 'recovery'
  }

  return 'control'
}

function getActionTitle(event: PolicyEventRecord) {
  const normalizedAction = event.action.toLowerCase()

  if (normalizedAction.includes('apply')) {
    return `Policy apply recorded for ${event.policy_name}`
  }

  if (normalizedAction.includes('verify')) {
    return `Policy verify recorded for ${event.policy_name}`
  }

  if (normalizedAction.includes('rollback')) {
    return `Rollback recorded for ${event.policy_name}`
  }

  if (normalizedAction.includes('recover') || normalizedAction.includes('baseline')) {
    return `Recovery activity recorded for ${event.policy_name}`
  }

  if (normalizedAction.includes('create')) {
    return `Policy object created for ${event.policy_name}`
  }

  return `${formatLabel(event.action)} recorded for ${event.policy_name}`
}

function getDesiredStateLabel(desiredState: PolicyDesiredState) {
  return desiredState === 'ENABLED' ? 'Enabled' : 'Disabled'
}

function getEvidenceDetails(evidence: PolicyEvidenceRecord) {
  const labels = evidence.relevant_flows
    .slice(0, 3)
    .map((flow) => `${flow.label || 'Flow'} · ${flow.cookie}`)

  return labels.length > 0 ? labels : undefined
}

function buildPolicyEventEntries(
  events: PolicyEventRecord[],
): OperationsTimelineItem[] {
  return events.map<OperationsTimelineItem>((event) => {
    const category = getActionCategory(event.action)
    const importance = getImportanceFromEvent(event)

    return {
      id: `event-${event.id}`,
      timestamp: event.timestamp,
      category,
      importance,
      title: getActionTitle(event),
      summary: event.message,
      related_policy_id: event.policy_id,
      related_policy_name: event.policy_name,
      related_area: 'Policy Center',
      related_path: '/policies',
      source: 'Recorded event log',
      derived: false,
      supporting_badges: [
        {
          label: 'Recorded event',
          tone: 'neutral',
        },
        {
          label: formatLabel(event.action),
          tone: getToneForImportance(importance),
        },
        {
          label: formatLabel(event.result),
          tone: event.result === 'success' ? 'success' : 'danger',
        },
        {
          label: formatLabel(event.compliance),
          tone: getToneForCompliance(event.compliance),
        },
      ],
      details: [
        `Desired ${getDesiredStateLabel(event.desired_state)}`,
        `Live ${formatLabel(event.live_state)}`,
      ],
    }
  })
}

function buildEvidenceEntries(
  policyHistory: PolicyHistorySnapshot[],
): OperationsTimelineItem[] {
  return policyHistory.flatMap<OperationsTimelineItem>((history) =>
    history.evidence.map((evidence, index) => {
      const importance = getImportanceFromCompliance(evidence.compliance)

      return {
        id: `evidence-${history.policy.id}-${index}-${evidence.timestamp}`,
        timestamp: evidence.timestamp,
        category: 'evidence',
        importance,
        title: `Observed evidence for ${history.policy.name}`,
        summary:
          evidence.summary ||
          `Recorded evidence snapshot captured ${evidence.flow_count} relevant flows for ${history.policy.name}.`,
        related_policy_id: history.policy.id,
        related_policy_name: history.policy.name,
        related_area: 'Flows',
        related_path: '/flows',
        source: 'Observed evidence snapshot',
        derived: false,
        supporting_badges: [
          {
            label: 'Observed evidence',
            tone: 'neutral',
          },
          {
            label: `${evidence.flow_count} flow${evidence.flow_count === 1 ? '' : 's'}`,
            tone: evidence.flow_count > 0 ? 'success' : 'warning',
          },
          {
            label: formatLabel(evidence.compliance),
            tone: getToneForCompliance(evidence.compliance),
          },
          {
            label: formatLabel(evidence.live_state),
            tone: getToneForLiveState(evidence.live_state),
          },
        ],
        details: getEvidenceDetails(evidence),
      }
    }),
  )
}

function buildVerificationEntries(
  policyHistory: PolicyHistorySnapshot[],
): OperationsTimelineItem[] {
  return policyHistory.flatMap<OperationsTimelineItem>((history) =>
    history.verifications.map((verification, index) => {
      const importance = getImportanceFromCompliance(verification.compliance)

      return {
        id: `verification-${history.policy.id}-${index}-${verification.timestamp}`,
        timestamp: verification.timestamp,
        category: 'verification',
        importance,
        title: `Recorded verification for ${history.policy.name}`,
        summary:
          verification.summary ||
          `Recorded verification snapshot for ${history.policy.name} is available in the current history.`,
        related_policy_id: history.policy.id,
        related_policy_name: history.policy.name,
        related_area: 'Policy Center',
        related_path: '/policies',
        source: 'Verification history',
        derived: false,
        supporting_badges: [
          {
            label: 'Recorded verification',
            tone: 'neutral',
          },
          {
            label: formatLabel(verification.action),
            tone: 'success',
          },
          {
            label: formatLabel(verification.compliance),
            tone: getToneForCompliance(verification.compliance),
          },
          {
            label: formatLabel(verification.live_state),
            tone: getToneForLiveState(verification.live_state),
          },
        ],
      }
    }),
  )
}

function buildDriftEntries(
  driftSummary: PolicyDriftSummaryResponse | null,
  checkedAt: string,
): OperationsTimelineItem[] {
  if (!driftSummary || driftSummary.total_policies === 0) {
    return [] as OperationsTimelineItem[]
  }

  if (driftSummary.drift_count === 0) {
    return [
      {
        id: 'drift-clear-current',
        timestamp: checkedAt,
        category: 'drift',
        importance: 'info',
        title: 'Current drift watch is clear',
        summary:
          'Derived timeline entry from the current drift summary. No drifted policies are reported in this snapshot.',
        related_policy_id: null,
        related_policy_name: null,
        related_area: 'Metrics Center',
        related_path: '/metrics-center',
        source: 'Current drift summary',
        derived: true,
        supporting_badges: [
          {
            label: 'Derived timeline entry',
            tone: 'neutral',
          },
          {
            label: 'Drift clear',
            tone: 'success',
          },
        ],
      },
    ]
  }

  return driftSummary.drifted_policies.map<OperationsTimelineItem>((policy) => ({
    id: `drift-${policy.id}`,
    timestamp: checkedAt,
    category: 'drift',
    importance: policy.compliance === 'DRIFT' ? 'critical' : 'warning',
    title: `Current drift signal for ${policy.name}`,
    summary:
      `Derived timeline entry from the current drift summary. Desired state is ${getDesiredStateLabel(
        policy.desired_state,
      )}, while the current live state is ${formatLabel(policy.live_state)}.`,
    related_policy_id: policy.id,
    related_policy_name: policy.name,
    related_area: 'Policy Center',
    related_path: '/policies',
    source: 'Current drift summary',
    derived: true,
    supporting_badges: [
      {
        label: 'Derived timeline entry',
        tone: 'neutral',
      },
      {
        label: 'Current drift signal',
        tone: policy.compliance === 'DRIFT' ? 'danger' : 'warning',
      },
      {
        label: formatLabel(policy.compliance),
        tone: getToneForCompliance(policy.compliance),
      },
    ],
  }))
}

function buildAlertEntries(alerts: AlertRecord[]): OperationsTimelineItem[] {
  return alerts.map<OperationsTimelineItem>((alert) => ({
    id: `alert-${alert.id}`,
    timestamp: alert.timestamp,
    category: 'alert',
    importance:
      alert.severity === 'critical'
        ? 'critical'
        : alert.severity === 'warning'
          ? 'warning'
          : 'info',
    title: alert.title,
    summary: `Derived timeline entry from current alert synthesis. ${alert.summary}`,
    related_policy_id: null,
    related_policy_name: null,
    related_area: alert.related_area,
    related_path: alert.related_path ?? null,
    source: alert.source,
    derived: true,
    supporting_badges: [
      {
        label: 'Derived alert signal',
        tone: 'neutral',
      },
      {
        label: alert.severity.toUpperCase(),
        tone: getToneForSeverity(alert.severity),
      },
      {
        label: alert.status,
        tone: alert.status === 'Open' ? getToneForSeverity(alert.severity) : 'neutral',
      },
    ],
  }))
}

function buildDemoStatusEntries(
  demoStatus: DemoPolicyStatusResponse | null,
  checkedAt: string,
): OperationsTimelineItem[] {
  if (!demoStatus) {
    return [] as OperationsTimelineItem[]
  }

  const restrictiveActiveCount = [
    demoStatus.block_ping_enabled,
    demoStatus.block_http_enabled,
    demoStatus.isolate_h1_enabled,
  ].filter(Boolean).length

  if (demoStatus.base_forwarding_enabled && restrictiveActiveCount === 0) {
    return [
      {
        id: 'demo-baseline-active',
        timestamp: checkedAt,
        category: 'recovery',
        importance: 'info',
        title: 'Baseline forwarding currently active',
        summary:
          'Derived timeline entry from current demo status. Baseline forwarding is enabled and no restrictive scenario is currently active.',
        related_policy_id: null,
        related_policy_name: null,
        related_area: 'Demo Assistant',
        related_path: '/demo-assistant',
        source: 'Current demo policy status',
        derived: true,
        supporting_badges: [
          {
            label: 'Derived timeline entry',
            tone: 'neutral',
          },
          {
            label: 'Baseline ready',
            tone: 'success',
          },
        ],
      },
    ]
  }

  if (restrictiveActiveCount > 0) {
    return [
      {
        id: 'demo-restrictive-active',
        timestamp: checkedAt,
        category: 'recovery',
        importance: 'warning',
        title: 'Restrictive demo policy remains active',
        summary:
          `Derived timeline entry from current demo status. ${restrictiveActiveCount} restrictive policies remain enabled, so rollback or baseline recovery may still be relevant.`,
        related_policy_id: null,
        related_policy_name: null,
        related_area: 'Demo Assistant',
        related_path: '/demo-assistant',
        source: 'Current demo policy status',
        derived: true,
        supporting_badges: [
          {
            label: 'Derived timeline entry',
            tone: 'neutral',
          },
          {
            label: 'Recovery path relevant',
            tone: 'warning',
          },
        ],
      },
    ]
  }

  return []
}

export function getOperationsTimelineCategoryLabel(
  category: OperationsTimelineCategory,
) {
  if (category === 'control') {
    return 'Control'
  }

  if (category === 'verification') {
    return 'Verification'
  }

  if (category === 'evidence') {
    return 'Evidence'
  }

  if (category === 'drift') {
    return 'Drift'
  }

  if (category === 'alert') {
    return 'Alert'
  }

  return 'Recovery'
}

export function getOperationsTimelineImportanceTone(
  importance: OperationsTimelineImportance,
): OperationsTimelineBadge['tone'] {
  return getToneForImportance(importance)
}

export function buildOperationsTimeline(
  input: BuildOperationsTimelineInput,
): OperationsTimelineItem[] {
  return [
    ...buildPolicyEventEntries(input.policyEvents),
    ...buildVerificationEntries(input.policyHistory),
    ...buildEvidenceEntries(input.policyHistory),
    ...buildDriftEntries(input.driftSummary, input.checkedAt),
    ...buildAlertEntries(input.alerts),
    ...buildDemoStatusEntries(input.demoStatus, input.checkedAt),
  ].sort((left, right) => {
    const timestampDifference = right.timestamp.localeCompare(left.timestamp)
    if (timestampDifference !== 0) {
      return timestampDifference
    }

    if (left.derived !== right.derived) {
      return left.derived ? 1 : -1
    }

    return left.title.localeCompare(right.title)
  })
}
