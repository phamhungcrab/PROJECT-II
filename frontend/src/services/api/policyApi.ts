import type {
  PolicyActionResponse,
  PolicyDriftSummaryResponse,
  PolicyEvidenceResponse,
  PolicyEventsResponse,
  PolicyListResponse,
  PolicyPreview,
  PolicyRecord,
  PolicySummaryResponse,
  PolicyVerificationsResponse,
} from '../../types/policy'
import { apiRequest } from './client'

function encodePolicyId(policyId: string) {
  return encodeURIComponent(policyId)
}

export const policyApi = {
  listPolicies: () => apiRequest<PolicyListResponse>('/api/policies'),
  getSummary: () => apiRequest<PolicySummaryResponse>('/api/policies/summary'),
  getEvents: () => apiRequest<PolicyEventsResponse>('/api/policies/events'),
  getDriftSummary: () =>
    apiRequest<PolicyDriftSummaryResponse>('/api/policies/drift'),
  getPolicy: (policyId: string) =>
    apiRequest<PolicyRecord>(`/api/policies/${encodePolicyId(policyId)}`),
  previewPolicy: (policyId: string) =>
    apiRequest<PolicyPreview>(
      `/api/policies/${encodePolicyId(policyId)}/preview`,
      {
        method: 'POST',
      },
    ),
  applyPolicy: (policyId: string) =>
    apiRequest<PolicyActionResponse>(
      `/api/policies/${encodePolicyId(policyId)}/apply`,
      {
        method: 'POST',
      },
    ),
  rollbackPolicy: (policyId: string) =>
    apiRequest<PolicyActionResponse>(
      `/api/policies/${encodePolicyId(policyId)}/rollback`,
      {
        method: 'POST',
      },
    ),
  verifyPolicy: (policyId: string) =>
    apiRequest<PolicyActionResponse>(
      `/api/policies/${encodePolicyId(policyId)}/verify`,
      {
        method: 'POST',
      },
    ),
  getEvidence: (policyId: string) =>
    apiRequest<PolicyEvidenceResponse>(
      `/api/policies/${encodePolicyId(policyId)}/evidence`,
    ),
  getVerifications: (policyId: string) =>
    apiRequest<PolicyVerificationsResponse>(
      `/api/policies/${encodePolicyId(policyId)}/verifications`,
    ),
}
