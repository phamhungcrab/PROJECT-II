export type PolicyDesiredState = 'ENABLED' | 'DISABLED'
export type PolicyLiveState = 'ENFORCED' | 'NOT_ENFORCED' | 'PARTIAL' | 'UNKNOWN'
export type PolicyCompliance = 'COMPLIANT' | 'PARTIAL' | 'DRIFT' | 'UNKNOWN'
export type PolicyOrigin = 'SEEDED' | 'TEMPLATE'
export type PolicyExecutionStatus = 'SUPPORTED' | 'PREVIEW_ONLY'

export interface PolicyRecord {
  id: string
  name: string
  type: string
  description: string
  target: string
  scope: string
  priority: number
  enabled: boolean
  desired_state: PolicyDesiredState
  live_state: PolicyLiveState
  compliance: PolicyCompliance
  created_at: string
  updated_at: string
  last_applied_at: string | null
  last_verified_at: string | null
  version: number
  origin?: PolicyOrigin | null
  template_type?: string | null
  source_host?: string | null
  destination_host?: string | null
  protocol?: string | null
  port?: number | null
  direction?: string | null
  action?: string | null
  execution_status?: PolicyExecutionStatus | null
  execution_reason?: string | null
}

export interface PolicyEventRecord {
  id: string
  policy_id: string
  policy_name: string
  action: string
  result: string
  timestamp: string
  desired_state: PolicyDesiredState
  live_state: PolicyLiveState
  compliance: PolicyCompliance
  message: string
}

export interface PolicyFlowEvidence {
  label: string
  flow_type: string
  cookie: string
  priority: number
  actions: string
}

export interface PolicyEvidenceRecord {
  policy_id: string
  timestamp: string
  action: string
  compliance: PolicyCompliance
  live_state: PolicyLiveState
  relevant_flows: PolicyFlowEvidence[]
  flow_count: number
  summary: string
}

export interface PolicyPreview {
  policy: PolicyRecord
  mapped_enforcement_action: string
  affected_target: string
  expected_impact: string
  notes?: string[] | null
  risk: string
  execution_status?: PolicyExecutionStatus | null
  execution_reason?: string | null
  generated_policy_shape?: PolicyRecord | null
  mapping_reference_policy_id?: string | null
  expected_cookies?: string[] | null
  expected_flow_labels?: string[] | null
  supports_apply?: boolean | null
  supports_verify?: boolean | null
  supports_rollback?: boolean | null
}

export interface PolicyListResponse {
  count: number
  policies: PolicyRecord[]
}

export interface PolicySummaryResponse {
  total_policies: number
  enabled_policies: number
  live_enforced_policies: number
  compliant_policies: number
  partial_policies: number
  drift_policies: number
  unknown_policies: number
  policies: PolicyRecord[]
}

export interface PolicyEventsResponse {
  count: number
  events: PolicyEventRecord[]
}

export interface PolicyActionResponse {
  applied?: boolean
  rolled_back?: boolean
  verified?: boolean
  policy: PolicyRecord
  event: PolicyEventRecord
}

export interface PolicyTemplateRequest {
  name: string
  template_type: string
  source_host: string
  destination_host: string
  protocol: 'icmp' | 'tcp' | 'ipv4'
  port: number | null
  direction: 'one-way' | 'two-way'
  action: 'block'
  description: string | null
}

export interface PolicyTemplateCreateResponse {
  created: boolean
  policy: PolicyRecord
  preview: PolicyPreview
}

export interface PolicyTemplateCapability {
  enabled: boolean
  reason: string | null
}

export interface PolicyEvidenceResponse {
  policy_id: string
  count: number
  evidence: PolicyEvidenceRecord[]
}

export interface PolicyVerificationsResponse {
  policy_id: string
  count: number
  verifications: PolicyEvidenceRecord[]
}

export interface PolicyDriftItem {
  id: string
  name: string
  desired_state: PolicyDesiredState
  live_state: PolicyLiveState
  compliance: PolicyCompliance
}

export interface PolicyDriftSummaryResponse {
  total_policies: number
  drift_count: number
  partial_count: number
  compliant_count: number
  unknown_count: number
  drifted_policies: PolicyDriftItem[]
}

export interface DemoPolicyStatusResponse {
  base_forwarding_enabled: boolean
  block_ping_enabled: boolean
  block_http_enabled: boolean
  isolate_h1_enabled: boolean
}
