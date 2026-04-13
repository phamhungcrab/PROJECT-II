import type { AlertRecord, AlertSeverity, AlertSummary } from '../types/alerts'
import type { DemoPolicyStatusResponse, PolicyDriftSummaryResponse, PolicySummaryResponse } from '../types/policy'
import type { HealthResponse, InventoryNodesResponse, OvsLiveFlowsResponse } from '../types/sdn'

const severityRank: Record<AlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

export interface AlertBuildInput {
  checkedAt: string
  health?: HealthResponse | null
  healthError?: string | null
  inventory?: InventoryNodesResponse | null
  policySummary?: PolicySummaryResponse | null
  policySummaryError?: string | null
  driftSummary?: PolicyDriftSummaryResponse | null
  driftError?: string | null
  demoStatus?: DemoPolicyStatusResponse | null
  demoStatusError?: string | null
  ovsEvidence?: OvsLiveFlowsResponse | null
  ovsEvidenceError?: string | null
  latestSnapshot?: string | null
}

function getMinutesSince(timestamp: string | null | undefined) {
  if (!timestamp) {
    return null
  }

  const parsedTimestamp = new Date(timestamp)
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return null
  }

  return (Date.now() - parsedTimestamp.getTime()) / 60_000
}

function getLatestInventorySnapshot(inventory?: InventoryNodesResponse | null) {
  const timestamps =
    inventory?.nodes
      .map((node) => node.snapshot?.end?.end ?? node.snapshot?.start?.begin ?? null)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left)) ?? []

  return timestamps[0] ?? null
}

function getOvsEvidenceFlags(ovsEvidence?: OvsLiveFlowsResponse | null) {
  const flows = ovsEvidence?.flows ?? []
  const policyFlows = flows.filter((flow) => flow.flow_type === 'policy')

  return {
    baseFlowCount: flows.filter((flow) => flow.flow_type === 'base').length,
    policyFlowCount: policyFlows.length,
    hasBaseForwarding: flows.some((flow) => flow.flow_type === 'base'),
    hasPingPolicy: policyFlows.some((flow) => flow.label.startsWith('Block Ping')),
    hasHttpPolicy: policyFlows.some((flow) => flow.label.startsWith('Block HTTP')),
    hasIsolationPolicy: policyFlows.some((flow) => flow.label.startsWith('Isolate H1')),
  }
}

function getMismatchedEvidenceLabels(
  demoStatus: DemoPolicyStatusResponse,
  ovsEvidence?: OvsLiveFlowsResponse | null,
) {
  const ovsFlags = getOvsEvidenceFlags(ovsEvidence)
  const mismatches: string[] = []

  if (demoStatus.base_forwarding_enabled !== ovsFlags.hasBaseForwarding) {
    mismatches.push('baseline forwarding evidence')
  }

  if (demoStatus.block_ping_enabled !== ovsFlags.hasPingPolicy) {
    mismatches.push('ping policy evidence')
  }

  if (demoStatus.block_http_enabled !== ovsFlags.hasHttpPolicy) {
    mismatches.push('HTTP policy evidence')
  }

  if (demoStatus.isolate_h1_enabled !== ovsFlags.hasIsolationPolicy) {
    mismatches.push('host isolation evidence')
  }

  return mismatches
}

function getEnabledPoliciesWithoutRecentVerification(
  policySummary?: PolicySummaryResponse | null,
) {
  return (
    policySummary?.policies.filter((policy) => {
      if (policy.desired_state !== 'ENABLED') {
        return false
      }

      const ageInMinutes = getMinutesSince(policy.last_verified_at)
      return ageInMinutes === null || ageInMinutes > 30
    }) ?? []
  )
}

export function getAlertSeverityTone(severity: AlertSeverity) {
  if (severity === 'critical') {
    return 'danger' as const
  }

  if (severity === 'warning') {
    return 'warning' as const
  }

  return 'neutral' as const
}

export function getAlertStatusTone(status: string, severity: AlertSeverity) {
  if (status === 'Open') {
    return severity === 'critical' ? ('danger' as const) : ('warning' as const)
  }

  return 'neutral' as const
}

export function summarizeAlerts(alerts: AlertRecord[]): AlertSummary {
  const infoCount = alerts.filter((alert) => alert.severity === 'info').length
  const warningCount = alerts.filter((alert) => alert.severity === 'warning').length
  const criticalCount = alerts.filter((alert) => alert.severity === 'critical').length

  return {
    total_alerts: alerts.length,
    active_alerts: warningCount + criticalCount,
    info_count: infoCount,
    warning_count: warningCount,
    critical_count: criticalCount,
  }
}

export function buildOperationalAlerts(input: AlertBuildInput) {
  const alerts: AlertRecord[] = []
  const latestSnapshot = input.latestSnapshot ?? getLatestInventorySnapshot(input.inventory)
  const latestSnapshotAge = getMinutesSince(latestSnapshot)
  const staleEnabledPolicies = getEnabledPoliciesWithoutRecentVerification(
    input.policySummary,
  )
  const checkedAt = input.checkedAt

  if (input.healthError && !input.health) {
    alerts.push({
      id: 'backend-health-unavailable',
      title: 'Controller health is unavailable',
      severity: 'critical',
      source: 'Health API',
      status: 'Open',
      summary:
        'The health endpoint could not confirm controller reachability, so control-plane telemetry may be incomplete.',
      suggested_action: 'Open Dashboard and refresh the health view before continuing the demo.',
      related_area: 'Dashboard',
      timestamp: checkedAt,
      action_label: 'Open Dashboard',
      action_kind: 'navigate',
      related_path: '/dashboard',
    })
  } else if (input.health && input.health.status !== 'ok') {
    alerts.push({
      id: 'controller-unreachable',
      title: 'Controller unreachable',
      severity: 'critical',
      source: 'Controller Health',
      status: 'Open',
      summary:
        'OpenDaylight health is not reporting an operational state. Inventory, topology, and policy evidence may be stale.',
      suggested_action: 'Open Dashboard and confirm controller reachability before running policy scenarios.',
      related_area: 'Dashboard',
      timestamp: checkedAt,
      action_label: 'Open Dashboard',
      action_kind: 'navigate',
      related_path: '/dashboard',
    })
  }

  if (input.policySummaryError && !input.policySummary) {
    alerts.push({
      id: 'policy-summary-unavailable',
      title: 'Policy compliance data unavailable',
      severity: 'warning',
      source: 'Policy Center',
      status: 'Open',
      summary:
        'Policy objects could not be loaded, so compliance and verification status may be outdated.',
      suggested_action: 'Open Policy Center and refresh policy state before narrating compliance.',
      related_area: 'Policy Center',
      timestamp: checkedAt,
      action_label: 'Open Policy Center',
      action_kind: 'navigate',
      related_path: '/policies',
    })
  }

  if (input.ovsEvidenceError && !input.ovsEvidence) {
    alerts.push({
      id: 'switch-evidence-unavailable',
      title: 'Switch evidence unavailable',
      severity: 'critical',
      source: 'Switch Evidence',
      status: 'Open',
      summary:
        'Live OVS evidence could not be read, so switch-side enforcement cannot be confirmed right now.',
      suggested_action: 'Open Flows and refresh OVS live flows before claiming enforcement is active.',
      related_area: 'Flows',
      timestamp: checkedAt,
      action_label: 'Open Flows',
      action_kind: 'navigate',
      related_path: '/flows',
    })
  }

  if (input.driftSummary?.drift_count) {
    const driftedNames = input.driftSummary.drifted_policies
      .slice(0, 3)
      .map((policy) => policy.name)
      .join(', ')

    alerts.push({
      id: 'policy-drift-detected',
      title: 'Drift detected',
      severity: input.driftSummary.drift_count > 1 ? 'critical' : 'warning',
      source: 'Policy Center',
      status: 'Open',
      summary: driftedNames
        ? `${input.driftSummary.drift_count} policies are drifted, including ${driftedNames}.`
        : `${input.driftSummary.drift_count} policies are drifted and require operator review.`,
      suggested_action: 'Open Policy Center and verify or recover the drifted policies.',
      related_area: 'Policy Center',
      timestamp: checkedAt,
      action_label: 'Open Policy Center',
      action_kind: 'navigate',
      related_path: '/policies',
    })
  }

  if (input.driftSummary?.partial_count) {
    alerts.push({
      id: 'policy-alignment-partial',
      title: 'Partial policy alignment observed',
      severity: 'warning',
      source: 'Policy Center',
      status: 'Open',
      summary: `${input.driftSummary.partial_count} policies are only partially enforced and should be reviewed before the next demo step.`,
      suggested_action: 'Open Policy Center and run verification on the affected policies.',
      related_area: 'Policy Center',
      timestamp: checkedAt,
      action_label: 'Open Policy Center',
      action_kind: 'navigate',
      related_path: '/policies',
    })
  }

  if (input.demoStatus) {
    const restrictiveActiveCount = [
      input.demoStatus.block_ping_enabled,
      input.demoStatus.block_http_enabled,
      input.demoStatus.isolate_h1_enabled,
    ].filter(Boolean).length

    if (restrictiveActiveCount > 1) {
      alerts.push({
        id: 'multiple-restrictive-policies-active',
        title: 'Multiple restrictive policies are active',
        severity: 'warning',
        source: 'Demo Assistant',
        status: 'Open',
        summary:
          'More than one restrictive policy is active at the same time, which can make demo narration and evidence interpretation less clean.',
        suggested_action: 'Recover baseline before running a clean single-scenario defense flow.',
        related_area: 'Demo Assistant',
        timestamp: checkedAt,
        action_label: 'Recover Baseline',
        action_kind: 'recover-baseline',
      })
    }

    if (!input.demoStatus.base_forwarding_enabled && restrictiveActiveCount === 0) {
      alerts.push({
        id: 'baseline-not-aligned',
        title: 'Baseline is not aligned',
        severity: 'warning',
        source: 'Policy Center',
        status: 'Open',
        summary:
          'No restrictive policy is active, but baseline forwarding is not confirmed on the current demo state.',
        suggested_action: 'Recover baseline and verify the base forwarding path before continuing.',
        related_area: 'Dashboard',
        timestamp: checkedAt,
        action_label: 'Recover Baseline',
        action_kind: 'recover-baseline',
      })
    }

    if (input.ovsEvidence) {
      const mismatches = getMismatchedEvidenceLabels(input.demoStatus, input.ovsEvidence)

      if (mismatches.length > 0) {
        alerts.push({
          id: 'controller-switch-evidence-mismatch',
          title: 'Controller vs switch mismatch',
          severity: 'warning',
          source: 'Switch Evidence',
          status: 'Open',
          summary: `The current dashboard state does not fully match live switch evidence for ${mismatches.join(', ')}.`,
          suggested_action: 'Open Flows and Policy Center to compare switch evidence against desired policy state.',
          related_area: 'Flows',
          timestamp: checkedAt,
          action_label: 'Open Flows',
          action_kind: 'navigate',
          related_path: '/flows',
        })
      }
    }
  } else if (input.demoStatusError) {
    alerts.push({
      id: 'demo-policy-state-unavailable',
      title: 'Demo policy state unavailable',
      severity: 'warning',
      source: 'Demo Assistant',
      status: 'Open',
      summary:
        'The current demo policy status could not be loaded, so scenario-state hygiene cannot be confirmed.',
      suggested_action: 'Open Demo Assistant or Dashboard and refresh policy state.',
      related_area: 'Demo Assistant',
      timestamp: checkedAt,
      action_label: 'Open Demo Assistant',
      action_kind: 'navigate',
      related_path: '/demo-assistant',
    })
  }

  if (staleEnabledPolicies.length > 0) {
    alerts.push({
      id: 'no-recent-verification',
      title: 'No recent verification for enabled policy',
      severity: 'warning',
      source: 'Policy Center',
      status: 'Open',
      summary: `${staleEnabledPolicies.length} enabled policies have missing or stale verification timestamps.`,
      suggested_action: 'Open Policy Center and verify the enabled policies against live OVS evidence.',
      related_area: 'Policy Center',
      timestamp:
        staleEnabledPolicies[0]?.last_verified_at ??
        staleEnabledPolicies[0]?.updated_at ??
        checkedAt,
      action_label: 'Open Policy Center',
      action_kind: 'navigate',
      related_path: '/policies',
    })
  }

  if (latestSnapshotAge === null) {
    alerts.push({
      id: 'model-snapshot-unavailable',
      title: 'Model snapshot unavailable',
      severity: 'warning',
      source: 'Model Viewer',
      status: 'Open',
      summary:
        'A recent inventory snapshot was not found, so the model-driven view may be incomplete.',
      suggested_action: 'Open Model Viewer and refresh the read-only snapshot before discussing structured device state.',
      related_area: 'Model Viewer',
      timestamp: checkedAt,
      action_label: 'Open Model Viewer',
      action_kind: 'navigate',
      related_path: '/model-viewer',
    })
  } else if (latestSnapshotAge > 30) {
    alerts.push({
      id: 'model-snapshot-stale',
      title: 'Model snapshot may be stale',
      severity: 'warning',
      source: 'Model Viewer',
      status: 'Open',
      summary:
        'The latest controller/device model snapshot is older than 30 minutes and may not reflect current operational state.',
      suggested_action: 'Open Model Viewer and refresh the model snapshot before presenting structured state.',
      related_area: 'Model Viewer',
      timestamp: latestSnapshot ?? checkedAt,
      action_label: 'Open Model Viewer',
      action_kind: 'navigate',
      related_path: '/model-viewer',
    })
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'control-plane-aligned',
      title: 'No active faults detected',
      severity: 'info',
      source: 'Alert Center',
      status: 'Watch',
      summary:
        'Controller health, policy compliance, switch evidence, and model freshness currently look aligned for demo use.',
      suggested_action: 'Keep the current state and proceed with the planned demo sequence.',
      related_area: 'Dashboard',
      timestamp: checkedAt,
      action_label: 'Open Dashboard',
      action_kind: 'navigate',
      related_path: '/dashboard',
    })
  }

  return alerts.sort((left, right) => {
    const severityDifference = severityRank[left.severity] - severityRank[right.severity]
    if (severityDifference !== 0) {
      return severityDifference
    }

    return right.timestamp.localeCompare(left.timestamp)
  })
}
