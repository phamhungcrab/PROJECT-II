import { useEffect, useState } from 'react'
import {
  PolicyTemplateBuilderPanel,
  PolicyTemplateBuilderUnavailablePanel,
} from '../components/policy/PolicyTemplateBuilderPanel'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { appConfig } from '../config/appConfig'
import { useApiResource } from '../hooks/useApiResource'
import { policyApi } from '../services/api/policyApi'
import { sdnApi } from '../services/api/sdnApi'
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
import type { FlowTableFlow } from '../types/sdn'
import { formatDateTime, formatLabel, formatNumber } from '../utils/formatters'

type PolicyFilter = 'all' | 'compliant' | 'drift' | 'enabled'
type PolicyRowAction = 'preview' | 'apply' | 'verify' | 'rollback'

interface GeneratedPolicyReport {
  generatedAt: string
  fileBaseName: string
  summaryText: string
  markdown: string
  json: string
}

interface PolicyExpectation {
  cookies: string[]
  labels: string[]
}

interface AlignmentResult {
  label:
    | 'Fully aligned'
    | 'Switch-only enforcement'
    | 'Partial alignment'
    | 'Controller evidence unavailable'
    | 'Drift detected'
    | 'Preview only'
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  summary: string
}

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

function formatOptionalLabel(
  value: string | null | undefined,
  fallback = 'N/A',
) {
  return value ? formatLabel(value) : fallback
}

function getPolicyOrigin(policy: PolicyRecord | null | undefined) {
  return policy?.origin === 'TEMPLATE' ? 'TEMPLATE' : 'SEEDED'
}

function getPolicyExecutionStatus(policy: PolicyRecord | null | undefined) {
  return policy?.execution_status === 'PREVIEW_ONLY'
    ? 'PREVIEW_ONLY'
    : 'SUPPORTED'
}

function getPolicyExecutionReason(policy: PolicyRecord | null | undefined) {
  return policy?.execution_reason ?? null
}

function getPreviewExecutionStatus(preview: PolicyPreview | null | undefined) {
  return preview?.execution_status === 'PREVIEW_ONLY'
    ? 'PREVIEW_ONLY'
    : 'SUPPORTED'
}

function getPreviewExecutionReason(preview: PolicyPreview | null | undefined) {
  return preview?.execution_reason ?? null
}

function getPreviewNotes(preview: PolicyPreview | null | undefined) {
  return Array.isArray(preview?.notes) ? preview.notes : []
}

function getPreviewExpectedCookies(preview: PolicyPreview | null | undefined) {
  return Array.isArray(preview?.expected_cookies) ? preview.expected_cookies : []
}

function getPreviewExpectedFlowLabels(
  preview: PolicyPreview | null | undefined,
) {
  return Array.isArray(preview?.expected_flow_labels)
    ? preview.expected_flow_labels
    : []
}

function summarizeEvidenceLabels(evidence: PolicyEvidenceResponse | null) {
  const latestEvidence = evidence?.evidence[0]
  if (!latestEvidence || latestEvidence.relevant_flows.length === 0) {
    return []
  }

  return latestEvidence.relevant_flows.map((flow) => flow.label || flow.cookie)
}

function buildRecoveryNote(policy: PolicyRecord) {
  if (getPolicyExecutionStatus(policy) === 'PREVIEW_ONLY') {
    return 'This template policy is preview-only, so rollback is not applicable. Create the object for planning, then add a supported execution mapping in a future batch if live enforcement is required.'
  }

  if (policy.id === 'baseline_forwarding') {
    return 'Use Apply to restore baseline forwarding again if the NORMAL flow is missing. Verify can be used to confirm switch alignment.'
  }

  return 'Use Rollback to safely revert this policy effect. If the wider lab state still looks inconsistent, use Recover Baseline from Dashboard and then verify again.'
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

function getPolicyExpectation(preview: PolicyPreview | null): PolicyExpectation {
  return {
    cookies: getPreviewExpectedCookies(preview),
    labels: getPreviewExpectedFlowLabels(preview),
  }
}

function getExecutionTone(
  executionStatus: 'SUPPORTED' | 'PREVIEW_ONLY' | null | undefined,
): 'success' | 'warning' {
  return executionStatus === 'SUPPORTED' ? 'success' : 'warning'
}

function getExecutionLabel(
  executionStatus: 'SUPPORTED' | 'PREVIEW_ONLY' | null | undefined,
) {
  return executionStatus === 'SUPPORTED' ? 'Live Mapped' : 'Preview Only'
}

function summarizeControllerActions(flow: FlowTableFlow) {
  const actions =
    flow.instructions?.instruction?.flatMap(
      (instruction) => instruction['apply-actions']?.action ?? [],
    ) ?? []

  if (actions.length === 0) {
    return 'No apply-actions returned'
  }

  return actions
    .map((action) => {
      const output = action['output-action']?.['output-node-connector']
      return output ? `Output ${output}` : `Action ${action.order}`
    })
    .join(' · ')
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
  const [generatedPolicyReport, setGeneratedPolicyReport] =
    useState<GeneratedPolicyReport | null>(null)
  const [reportMessage, setReportMessage] = useState<string | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)

  const policyQuery = useApiResource(policyApi.listPolicies, [])
  const summaryQuery = useApiResource(policyApi.getSummary, [])
  const eventsQuery = useApiResource(policyApi.getEvents, [])
  const driftQuery = useApiResource(policyApi.getDriftSummary, [])
  const templateCapabilityQuery = useApiResource(
    policyApi.getTemplateCapability,
    [],
  )
  const controllerFlowQuery = useApiResource(
    () => sdnApi.getFlows(appConfig.defaultFlowNodeId),
    [appConfig.defaultFlowNodeId],
  )

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

    const searchableText = [
      policy.name,
      policy.type,
      policy.target,
      policy.template_type ?? '',
      policy.source_host ?? '',
      policy.destination_host ?? '',
      policy.protocol ?? '',
      policy.direction ?? '',
      policy.action ?? '',
      policy.execution_status,
    ]
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
      setGeneratedPolicyReport(null)
      setReportMessage(null)
      setReportError(null)
      return
    }

    setGeneratedPolicyReport(null)
    setReportMessage(null)
    setReportError(null)
    void loadPolicyWorkspace(selectedPolicyId)
  }, [selectedPolicyId])

  async function refreshPolicyCenter(policyId: string | null = selectedPolicyId) {
    policyQuery.reload()
    summaryQuery.reload()
    eventsQuery.reload()
    driftQuery.reload()
    templateCapabilityQuery.reload()
    controllerFlowQuery.reload()

    if (policyId) {
      await loadPolicyWorkspace(policyId)
    }
  }

  async function handleTemplateCreated(policyId: string) {
    setSelectedPolicyId(policyId)
    setActionError(null)
    setActionResult(null)
    setGeneratedPolicyReport(null)
    setReportMessage(null)
    setReportError(null)
    await refreshPolicyCenter(policyId)
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
      setGeneratedPolicyReport(null)
      setReportMessage(null)
      setReportError(null)
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
  const templateCapability = templateCapabilityQuery.data
  const policyExpectation = getPolicyExpectation(policyPreview)
  const selectedPolicyOrigin = getPolicyOrigin(selectedPolicy)
  const selectedPolicyExecutionStatus = getPolicyExecutionStatus(selectedPolicy)
  const previewExecutionStatus = getPreviewExecutionStatus(policyPreview)
  const previewExecutionReason = getPreviewExecutionReason(policyPreview)
  const previewNotes = getPreviewNotes(policyPreview)
  const previewExpectedCookies = getPreviewExpectedCookies(policyPreview)
  const previewExpectedFlowLabels = getPreviewExpectedFlowLabels(policyPreview)
  const controllerFlows =
    controllerFlowQuery.data?.tables.flatMap((table) =>
      (table.flows ?? []).map((flow) => ({
        flow_id: flow.flow_id,
        table_id: flow.table_id ?? table.table_id,
        cookie: flow.cookie ?? 'No cookie',
        priority: flow.priority,
        actions: summarizeControllerActions(flow),
      })),
    ) ?? []
  const relatedControllerFlows = controllerFlows.filter((flow) =>
    policyExpectation.cookies.includes(flow.cookie),
  )
  const controllerEvidenceStatus =
    selectedPolicyExecutionStatus === 'PREVIEW_ONLY'
      ? {
          label: 'Preview Only',
          tone: 'warning' as const,
          summary:
            previewExecutionReason ??
            'No controller evidence is expected because this policy has no live execution mapping in v1.',
        }
      : relatedControllerFlows.length > 0
        ? {
            label: 'Observed',
            tone: 'success' as const,
            summary: `${formatNumber(relatedControllerFlows.length)} exact controller entr${
              relatedControllerFlows.length === 1 ? 'y' : 'ies'
            } matched the expected policy cookies on ${appConfig.defaultFlowNodeId}.`,
          }
        : controllerFlowQuery.data
          ? {
              label: 'Partial',
              tone: 'warning' as const,
              summary: `ODL flow data is available for ${appConfig.defaultFlowNodeId}, but no exact controller cookie match was confirmed for this policy. Current demo enforcement may be switch-direct.`,
            }
          : controllerFlowQuery.error
            ? {
                label: 'Unavailable',
                tone: 'neutral' as const,
                summary:
                  'Controller evidence is unavailable right now. The comparison keeps switch-side evidence visible and explicit.',
              }
            : {
                label: 'Unavailable',
                tone: 'neutral' as const,
                summary: 'Controller evidence has not been loaded yet.',
              }
  const switchEvidenceCount = latestEvidence?.flow_count ?? 0
  const switchEvidenceFlows = latestEvidence?.relevant_flows ?? []
  const alignmentResult: AlignmentResult = (() => {
    if (!selectedPolicy) {
      return {
        label: 'Controller evidence unavailable',
        tone: 'neutral',
        summary: 'Select a policy to compare management intent with controller and switch evidence.',
      }
    }

    if (selectedPolicyExecutionStatus === 'PREVIEW_ONLY') {
      return {
        label: 'Preview only',
        tone: 'warning',
        summary:
          previewExecutionReason ??
          'This policy object is intentionally visible in inventory but does not have a live enforcement mapping in v1.',
      }
    }

    if (selectedPolicy.compliance === 'DRIFT') {
      return {
        label: 'Drift detected',
        tone: 'danger',
        summary:
          'Policy intent and live switch state are not aligned. This is the strongest signal that operator attention is required.',
      }
    }

    if (
      selectedPolicy.compliance === 'PARTIAL' ||
      selectedPolicy.live_state === 'PARTIAL'
    ) {
      return {
        label: 'Partial alignment',
        tone: 'warning',
        summary:
          'The policy is only partially represented across the management and enforcement layers. Verify the policy and inspect switch evidence before continuing.',
      }
    }

    if (
      selectedPolicy.desired_state === 'DISABLED' &&
      selectedPolicy.compliance === 'COMPLIANT' &&
      switchEvidenceCount === 0
    ) {
      return {
        label: 'Fully aligned',
        tone: 'success',
        summary:
          'The policy is intentionally cleared and the switch currently shows no related evidence flows, which is aligned with the desired state.',
      }
    }

    if (
      selectedPolicy.compliance === 'COMPLIANT' &&
      switchEvidenceCount > 0 &&
      relatedControllerFlows.length > 0
    ) {
      return {
        label: 'Fully aligned',
        tone: 'success',
        summary:
          'Policy intent is visible in Policy Center, related controller entries are observed, and switch-side evidence confirms live enforcement.',
      }
    }

    if (
      selectedPolicy.compliance === 'COMPLIANT' &&
      switchEvidenceCount > 0 &&
      controllerFlowQuery.error
    ) {
      return {
        label: 'Controller evidence unavailable',
        tone: 'neutral',
        summary:
          'Switch-side enforcement is confirmed, but controller evidence could not be loaded in this view.',
      }
    }

    if (selectedPolicy.compliance === 'COMPLIANT' && switchEvidenceCount > 0) {
      return {
        label: 'Switch-only enforcement',
        tone: 'warning',
        summary:
          'Policy intent is aligned with switch-side enforcement, but this project currently cannot prove an exact controller-side flow match for the selected policy.',
      }
    }

    return {
      label: 'Controller evidence unavailable',
      tone: 'neutral',
      summary:
        'Controller evidence is not strong enough to prove a direct mapping here. Policy Center and switch evidence remain the primary sources.',
    }
  })()
  const comparisonSummary = selectedPolicy
    ? selectedPolicyExecutionStatus === 'PREVIEW_ONLY'
      ? `Policy intent is visible in Policy Center, but this template remains preview-only. No controller or switch-side execution mapping is expected until a future live mapping is implemented.`
      : `Policy intent is visible in Policy Center. Controller flow view on ${appConfig.defaultFlowNodeId} shows ${formatNumber(relatedControllerFlows.length)} exact related entr${
          relatedControllerFlows.length === 1 ? 'y' : 'ies'
        }. Switch evidence shows ${formatNumber(
          switchEvidenceCount,
        )} live entr${switchEvidenceCount === 1 ? 'y' : 'ies'}. Overall alignment is ${alignmentResult.label}.`
    : 'Select a policy to compare intent, controller visibility, and switch-side enforcement.'

  function buildPolicyReport() {
    if (!selectedPolicy || !policyPreview) {
      throw new Error('Policy detail is still loading. Try again in a moment.')
    }

    const generatedAt = new Date().toISOString()
    const relevantFlows =
      latestEvidence?.relevant_flows.map((flow) => ({
        label: flow.label,
        cookie: flow.cookie,
        priority: flow.priority,
        actions: flow.actions,
      })) ?? []
    const recentVerifications =
      policyVerifications?.verifications.slice(0, 3).map((verification) => ({
        timestamp: verification.timestamp,
        compliance: verification.compliance,
        live_state: verification.live_state,
        flow_count: verification.flow_count,
        summary: verification.summary,
      })) ?? []
    const recentEvents = selectedPolicyEvents.map((event) => ({
      timestamp: event.timestamp,
      action: event.action,
      compliance: event.compliance,
      result: event.result,
      message: event.message,
    }))
    const driftSummary = {
      drift_count: driftQuery.data?.drift_count ?? 0,
      partial_count: driftQuery.data?.partial_count ?? 0,
      compliant_count: driftQuery.data?.compliant_count ?? 0,
      unknown_count: driftQuery.data?.unknown_count ?? 0,
      drifted_policies:
        driftQuery.data?.drifted_policies.map((policy) => policy.name) ?? [],
    }
    const recoveryNote = buildRecoveryNote(selectedPolicy)
    const reportPayload = {
      generated_at: generatedAt,
      policy_overview: {
        name: selectedPolicy.name,
        id: selectedPolicy.id,
        type: selectedPolicy.type,
        origin: selectedPolicyOrigin,
        template_type: selectedPolicy.template_type ?? null,
        source_host: selectedPolicy.source_host ?? null,
        destination_host: selectedPolicy.destination_host ?? null,
        protocol: selectedPolicy.protocol ?? null,
        port: selectedPolicy.port ?? null,
        direction: selectedPolicy.direction ?? null,
        action: selectedPolicy.action ?? null,
        target: selectedPolicy.target,
        description: selectedPolicy.description,
      },
      intended_enforcement: {
        mapped_enforcement_action: policyPreview.mapped_enforcement_action,
        expected_impact: policyPreview.expected_impact,
        notes: previewNotes,
        risk: policyPreview.risk,
        execution_status: previewExecutionStatus,
        execution_reason: previewExecutionReason,
        mapping_reference_policy_id: policyPreview.mapping_reference_policy_id ?? null,
        expected_cookies: previewExpectedCookies,
        expected_flow_labels: previewExpectedFlowLabels,
      },
      compliance_result: {
        desired_state: selectedPolicy.desired_state,
        live_state: selectedPolicy.live_state,
        compliance: selectedPolicy.compliance,
        last_applied_at: selectedPolicy.last_applied_at,
        last_verified_at: selectedPolicy.last_verified_at,
      },
      live_enforcement_evidence: {
        latest_summary: latestEvidence?.summary ?? 'No evidence snapshot available yet.',
        flow_count: latestEvidence?.flow_count ?? 0,
        relevant_flows: relevantFlows,
      },
      verification_history: {
        verification_count: policyVerifications?.count ?? 0,
        latest_summary:
          latestVerification?.summary ?? 'No verification history available yet.',
        recent_verifications: recentVerifications,
      },
      recent_event_timeline: recentEvents,
      drift_summary: driftSummary,
      recovery_path: {
        note: recoveryNote,
        rollback_action: 'Use the Rollback action in Policy Center.',
      },
    }

    const summaryText = [
      `Policy: ${selectedPolicy.name} (${selectedPolicy.id})`,
      `Origin: ${selectedPolicyOrigin}`,
      `Desired state: ${selectedPolicy.desired_state}`,
      `Live state: ${selectedPolicy.live_state}`,
      `Compliance: ${selectedPolicy.compliance}`,
      `Execution support: ${previewExecutionStatus}${previewExecutionReason ? ` (${previewExecutionReason})` : ''}`,
      `Latest evidence: ${latestEvidence?.summary ?? 'No evidence snapshot available yet.'}`,
      `Drift watch: ${formatNumber(driftSummary.drift_count)} drift / ${formatNumber(driftSummary.partial_count)} partial / ${formatNumber(driftSummary.compliant_count)} compliant`,
      `Recovery path: ${recoveryNote}`,
    ].join('\n')

    const markdown = [
      `# Policy Evidence Report`,
      ``,
      `Generated at: ${formatDateTime(generatedAt)}`,
      ``,
      `## Policy Overview`,
      `- Name: ${selectedPolicy.name}`,
      `- ID: ${selectedPolicy.id}`,
      `- Type: ${formatLabel(selectedPolicy.type)}`,
      `- Origin: ${formatOptionalLabel(selectedPolicyOrigin)}`,
      `- Template type: ${formatOptionalLabel(selectedPolicy.template_type)}`,
      `- Source host: ${selectedPolicy.source_host ?? 'N/A'}`,
      `- Destination host: ${selectedPolicy.destination_host ?? 'N/A'}`,
      `- Protocol: ${formatOptionalLabel(selectedPolicy.protocol)}`,
      `- Port: ${selectedPolicy.port ?? 'N/A'}`,
      `- Direction: ${formatOptionalLabel(selectedPolicy.direction)}`,
      `- Action: ${formatOptionalLabel(selectedPolicy.action)}`,
      `- Target: ${selectedPolicy.target}`,
      `- Description: ${selectedPolicy.description}`,
      ``,
      `## Intended Enforcement`,
      `- Mapped enforcement action: ${policyPreview.mapped_enforcement_action}`,
      `- Expected impact: ${policyPreview.expected_impact}`,
      `- Notes: ${previewNotes.join(' | ') || 'N/A'}`,
      `- Risk: ${policyPreview.risk}`,
      `- Execution status: ${formatOptionalLabel(previewExecutionStatus)}`,
      `- Execution reason: ${previewExecutionReason ?? 'N/A'}`,
      `- Mapping reference: ${policyPreview.mapping_reference_policy_id ?? 'N/A'}`,
      `- Expected cookies: ${previewExpectedCookies.join(', ') || 'N/A'}`,
      `- Expected flow labels: ${previewExpectedFlowLabels.join(', ') || 'N/A'}`,
      ``,
      `## Live Enforcement Evidence`,
      `- Desired state: ${selectedPolicy.desired_state}`,
      `- Live state: ${selectedPolicy.live_state}`,
      `- Compliance: ${selectedPolicy.compliance}`,
      `- Last applied: ${formatDateTime(selectedPolicy.last_applied_at)}`,
      `- Last verified: ${formatDateTime(selectedPolicy.last_verified_at)}`,
      `- Latest evidence summary: ${latestEvidence?.summary ?? 'No evidence snapshot available yet.'}`,
      `- Relevant flow count: ${formatNumber(latestEvidence?.flow_count ?? 0)}`,
      '',
      ...(
        relevantFlows.length > 0
          ? relevantFlows.map(
              (flow) =>
                `  - ${flow.label} | ${flow.cookie} | priority ${formatNumber(flow.priority)} | ${flow.actions}`,
            )
          : ['  - No relevant compact flows recorded.']
      ),
      ``,
      `## Compliance Result`,
      `- Drift summary: ${formatNumber(driftSummary.drift_count)} drift / ${formatNumber(driftSummary.partial_count)} partial / ${formatNumber(driftSummary.compliant_count)} compliant / ${formatNumber(driftSummary.unknown_count)} unknown`,
      `- Drifted policies: ${driftSummary.drifted_policies.join(', ') || 'None'}`,
      `- Latest verification: ${latestVerification?.summary ?? 'No verification history available yet.'}`,
      ``,
      `## Recent Event Timeline`,
      ...(
        recentEvents.length > 0
          ? recentEvents.map(
              (event) =>
                `- ${formatDateTime(event.timestamp)} | ${formatLabel(event.action)} | ${event.result} | ${event.compliance} | ${event.message}`,
            )
          : ['- No recent policy events for this policy.']
      ),
      ``,
      `## Recovery Path`,
      `- ${recoveryNote}`,
      `- Rollback action: Use the Rollback action in Policy Center.`,
    ].join('\n')

    return {
      generatedAt,
      fileBaseName: `${selectedPolicy.id}-evidence-report`,
      summaryText,
      markdown,
      json: JSON.stringify(reportPayload, null, 2),
    }
  }

  function handleGenerateReport() {
    setReportError(null)

    try {
      const report = buildPolicyReport()
      setGeneratedPolicyReport(report)
      setReportMessage(`Report generated for ${selectedPolicy?.name ?? 'selected policy'}.`)
    } catch (error) {
      setReportError(getErrorMessage(error))
    }
  }

  async function handleCopySummary() {
    setReportError(null)

    try {
      const report = generatedPolicyReport ?? buildPolicyReport()

      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard copy is not available in this browser context.')
      }

      await navigator.clipboard.writeText(report.summaryText)
      setGeneratedPolicyReport(report)
      setReportMessage('Report summary copied to clipboard.')
    } catch (error) {
      setReportError(getErrorMessage(error))
    }
  }

  function handleExportJson() {
    setReportError(null)

    try {
      const report = generatedPolicyReport ?? buildPolicyReport()
      setGeneratedPolicyReport(report)
      downloadTextFile(
        `${report.fileBaseName}.json`,
        report.json,
        'application/json;charset=utf-8',
      )
      setReportMessage('JSON evidence report downloaded.')
    } catch (error) {
      setReportError(getErrorMessage(error))
    }
  }

  function handleExportMarkdown() {
    setReportError(null)

    try {
      const report = generatedPolicyReport ?? buildPolicyReport()
      setGeneratedPolicyReport(report)
      downloadTextFile(
        `${report.fileBaseName}.md`,
        report.markdown,
        'text/markdown;charset=utf-8',
      )
      setReportMessage('Markdown evidence report downloaded.')
    } catch (error) {
      setReportError(getErrorMessage(error))
    }
  }

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
        <LoadingState
          label="Loading policy inventory..."
          hint="Preparing policy objects, compliance state, and lifecycle controls."
          variant="table"
        />
      ) : null}

      {policyQuery.error && !policyQuery.data ? (
        <ErrorState
          title="Policy inventory unavailable"
          message={policyQuery.error}
          onRetry={policyQuery.reload}
        />
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

          {templateCapability?.enabled ? (
            <PolicyTemplateBuilderPanel onTemplateCreated={handleTemplateCreated} />
          ) : (
            <PolicyTemplateBuilderUnavailablePanel
              isChecking={templateCapabilityQuery.isLoading}
              reason={templateCapability?.reason ?? null}
            />
          )}

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
                placeholder="Search name, type, target, protocol"
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
                  eyebrow="Filter result"
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
                      const supportsLiveActions =
                        getPolicyExecutionStatus(policy) === 'SUPPORTED'

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
                              <div className="chip-row">
                                <span className="chip">
                                  {getPolicyOrigin(policy) === 'TEMPLATE'
                                    ? 'Template'
                                    : 'Seeded'}
                                </span>
                                <span className="chip">
                                  {getExecutionLabel(getPolicyExecutionStatus(policy))}
                                </span>
                                {policy.template_type ? (
                                  <span className="chip">
                                    {formatLabel(policy.template_type)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <strong>{formatLabel(policy.type)}</strong>
                              {policy.protocol ? (
                                <span className="cell-muted">
                                  {formatLabel(policy.protocol)}
                                  {policy.port !== null ? `/${policy.port}` : ''} ·{' '}
                                  {formatLabel(policy.direction ?? 'n/a')}
                                </span>
                              ) : null}
                            </div>
                          </td>
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
                                disabled={Boolean(actionState) || !supportsLiveActions}
                                title={
                                  supportsLiveActions
                                    ? undefined
                                    : getPolicyExecutionReason(policy) ?? 'Preview-only policy'
                                }
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
                                disabled={Boolean(actionState) || !supportsLiveActions}
                                title={
                                  supportsLiveActions
                                    ? undefined
                                    : getPolicyExecutionReason(policy) ?? 'Preview-only policy'
                                }
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
                                disabled={Boolean(actionState) || !supportsLiveActions}
                                title={
                                  supportsLiveActions
                                    ? undefined
                                    : getPolicyExecutionReason(policy) ?? 'Preview-only policy'
                                }
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
                <LoadingState
                  label="Loading policy detail workspace..."
                  hint="Collecting selected policy metadata, preview, and operator context."
                  variant="workspace"
                />
              ) : null}

              {!selectedPolicyId ? (
                <EmptyState
                  title="No policy selected"
                  description="Select a policy row to inspect preview, evidence, and verification state."
                  eyebrow="Selection"
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
                      <span className="metadata-label">Origin</span>
                      <div style={{ marginTop: '8px' }}>
                        <StatusBadge
                          label={formatOptionalLabel(selectedPolicyOrigin)}
                          tone={selectedPolicyOrigin === 'TEMPLATE' ? 'warning' : 'success'}
                        />
                      </div>
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
                      <span className="metadata-label">Execution</span>
                      <div style={{ marginTop: '8px' }}>
                        <StatusBadge
                          label={getExecutionLabel(selectedPolicyExecutionStatus)}
                          tone={getExecutionTone(selectedPolicyExecutionStatus)}
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
                    <span className="metadata-label">Template Metadata</span>
                    <div className="chip-row" style={{ marginTop: '12px' }}>
                      <span className="chip">
                        Template {formatOptionalLabel(selectedPolicy.template_type)}
                      </span>
                      <span className="chip">
                        Source {selectedPolicy.source_host ?? 'N/A'}
                      </span>
                      <span className="chip">
                        Destination {selectedPolicy.destination_host ?? 'N/A'}
                      </span>
                      <span className="chip">
                        Protocol {formatOptionalLabel(selectedPolicy.protocol)}
                      </span>
                      {selectedPolicy.port !== null &&
                      selectedPolicy.port !== undefined ? (
                        <span className="chip">Port {selectedPolicy.port}</span>
                      ) : null}
                      <span className="chip">
                        Direction {formatOptionalLabel(selectedPolicy.direction)}
                      </span>
                      <span className="chip">
                        Action {formatOptionalLabel(selectedPolicy.action)}
                      </span>
                      <span className="chip">Version {selectedPolicy.version}</span>
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
                    {previewExecutionReason ? (
                      <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                        {previewExecutionReason}
                      </p>
                    ) : null}
                  </div>

                  <div className="content-grid" style={{ marginTop: '16px' }}>
                    <div className="metadata-item">
                      <span className="metadata-label">Notes</span>
                      <div className="chip-row" style={{ marginTop: '12px' }}>
                        {previewNotes.length > 0 ? (
                          previewNotes.map((note) => (
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
                      {policyPreview?.mapping_reference_policy_id ? (
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          Current mapping reference: {policyPreview.mapping_reference_policy_id}
                        </p>
                      ) : null}
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
                <LoadingState
                  label="Loading evidence and verification history..."
                  hint="Reading live OVS evidence, verification history, and recent policy activity."
                  variant="list"
                />
              ) : null}

              {!selectedPolicyId ? (
                <EmptyState
                  title="No evidence selected"
                  description="Choose a policy to review live OVS evidence and verification history."
                  eyebrow="Evidence"
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
                    <span className="metadata-label">Controller vs Switch Evidence Matrix</span>
                    <div
                      className="metadata-grid"
                      style={{
                        marginTop: '12px',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      }}
                    >
                      <div className="metadata-item">
                        <span className="metadata-label">Intent</span>
                        <strong className="metadata-value">{selectedPolicy.name}</strong>
                        <div style={{ marginTop: '10px' }}>
                          <StatusBadge
                            label={getExecutionLabel(selectedPolicyExecutionStatus)}
                            tone={getExecutionTone(selectedPolicyExecutionStatus)}
                          />
                        </div>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          Target {selectedPolicy.target} · Desired {formatState(selectedPolicy.desired_state)}
                        </p>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          {policyPreview?.mapped_enforcement_action ?? 'Mapped enforcement action unavailable.'}
                        </p>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          {policyPreview?.expected_impact ?? 'Expected effect unavailable.'}
                        </p>
                      </div>

                      <div className="metadata-item">
                        <span className="metadata-label">Controller View</span>
                        {controllerFlowQuery.isLoading && !controllerFlowQuery.data ? (
                          <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                            Loading controller flow evidence for {appConfig.defaultFlowNodeId}...
                          </p>
                        ) : (
                          <>
                            <div style={{ marginTop: '10px' }}>
                              <StatusBadge
                                label={controllerEvidenceStatus.label}
                                tone={controllerEvidenceStatus.tone}
                              />
                            </div>
                            {controllerFlowQuery.error ? (
                              <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                                Latest controller refresh failed: {controllerFlowQuery.error}
                              </p>
                            ) : null}
                            <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                              {controllerEvidenceStatus.summary}
                            </p>
                            {relatedControllerFlows.length > 0 ? (
                              <ul className="entity-list" style={{ marginTop: '12px' }}>
                                {relatedControllerFlows.slice(0, 3).map((flow) => (
                                  <li
                                    key={`${flow.flow_id}-${flow.cookie}`}
                                    className="entity-list-item"
                                  >
                                    <div>
                                      <div className="entity-list-heading">
                                        <strong className="mono">{flow.flow_id}</strong>
                                      </div>
                                      <p className="entity-list-meta">
                                        Cookie {flow.cookie} · Priority {formatNumber(flow.priority)}
                                      </p>
                                      <p className="entity-list-meta">{flow.actions}</p>
                                    </div>
                                    <span className="entity-list-trailing">
                                      Table {formatNumber(flow.table_id)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                                {selectedPolicyExecutionStatus === 'PREVIEW_ONLY'
                                  ? 'No controller-side flow IDs are expected because this policy has no live execution mapping.'
                                  : 'No exact controller-side flow IDs or cookies were confirmed for this policy.'}
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="metadata-item">
                        <span className="metadata-label">Switch View</span>
                        <div style={{ marginTop: '10px' }}>
                          <StatusBadge
                            label={formatState(selectedPolicy.live_state)}
                            tone={getLiveStateTone(selectedPolicy.live_state)}
                          />
                        </div>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          Switch evidence shows {formatNumber(switchEvidenceCount)} likely related entr
                          {switchEvidenceCount === 1 ? 'y' : 'ies'} with compliance{' '}
                          {formatState(selectedPolicy.compliance)}.
                        </p>
                        {switchEvidenceFlows.length > 0 ? (
                          <ul className="entity-list" style={{ marginTop: '12px' }}>
                            {switchEvidenceFlows.map((flow) => (
                              <li key={`${flow.cookie}-${flow.label}`} className="entity-list-item">
                                <div>
                                  <div className="entity-list-heading">
                                    <strong>{flow.label}</strong>
                                  </div>
                                  <p className="entity-list-meta">
                                    Cookie {flow.cookie} · Priority {formatNumber(flow.priority)}
                                  </p>
                                  <p className="entity-list-meta">{flow.actions}</p>
                                </div>
                                <span className="entity-list-trailing">
                                  {formatLabel(flow.flow_type)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                            No compact switch evidence flows are currently recorded for this policy.
                          </p>
                        )}
                      </div>

                      <div className="metadata-item">
                        <span className="metadata-label">Alignment</span>
                        <div style={{ marginTop: '10px' }}>
                          <StatusBadge
                            label={alignmentResult.label}
                            tone={alignmentResult.tone}
                          />
                        </div>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          {alignmentResult.summary}
                        </p>
                        <div className="chip-row" style={{ marginTop: '12px' }}>
                          {policyExpectation.labels.length > 0 ||
                          policyExpectation.cookies.length > 0 ? (
                            <>
                              {policyExpectation.labels.map((label) => (
                                <span key={label} className="chip">
                                  {label}
                                </span>
                              ))}
                              {policyExpectation.cookies.map((cookie) => (
                                <span key={cookie} className="chip">
                                  {cookie}
                                </span>
                              ))}
                            </>
                          ) : (
                            <span className="cell-muted">
                              No execution cookies or flow labels are expected for this policy.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Comparison Summary</span>
                    <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                      {comparisonSummary}
                    </p>
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

                  <div className="metadata-item" style={{ marginTop: '16px' }}>
                    <span className="metadata-label">Evidence Report / Scenario Export</span>
                    <div className="form-actions" style={{ marginTop: '12px' }}>
                      <button
                        className="button"
                        type="button"
                        disabled={isDetailLoading}
                        onClick={handleGenerateReport}
                      >
                        Generate Report
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={isDetailLoading}
                        onClick={() => void handleCopySummary()}
                      >
                        Copy Summary
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={isDetailLoading}
                        onClick={handleExportJson}
                      >
                        Export JSON
                      </button>
                      <button
                        className="button button--ghost"
                        type="button"
                        disabled={isDetailLoading}
                        onClick={handleExportMarkdown}
                      >
                        Export Markdown
                      </button>
                    </div>

                    {reportError ? (
                      <div className="notice notice--warning" style={{ marginTop: '16px' }}>
                        {reportError}
                      </div>
                    ) : null}

                    {reportMessage ? (
                      <p className="entity-list-meta" style={{ marginTop: '16px' }}>
                        {reportMessage}
                      </p>
                    ) : null}

                    {generatedPolicyReport ? (
                      <>
                        <div className="metadata-item" style={{ marginTop: '16px' }}>
                          <span className="metadata-label">Report Summary</span>
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
                            {generatedPolicyReport.summaryText}
                          </pre>
                        </div>

                        <div className="metadata-item" style={{ marginTop: '16px' }}>
                          <span className="metadata-label">Markdown Preview</span>
                          <pre
                            className="mono"
                            style={{
                              marginTop: '12px',
                              marginBottom: 0,
                              maxHeight: '360px',
                              overflow: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {generatedPolicyReport.markdown}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <p className="entity-list-meta" style={{ marginTop: '16px' }}>
                        Generate a concise operator report from the selected policy,
                        live evidence, compliance state, drift summary, and recovery path.
                      </p>
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
