import type {
  DemoPolicyStatusResponse,
  PolicyActionResponse,
  PolicyDriftSummaryResponse,
  PolicyEvidenceResponse,
  PolicyEventsResponse,
  PolicyListResponse,
  PolicyPreview,
  PolicyRecord,
  PolicySummaryResponse,
  PolicyTemplateCapability,
  PolicyTemplateCreateResponse,
  PolicyTemplateRequest,
  PolicyVerificationsResponse,
} from '../../types/policy'
import { apiRequest } from './client'

interface OpenApiOperationMap {
  get?: object
  post?: object
}

interface OpenApiDocument {
  paths?: Record<string, OpenApiOperationMap | undefined>
}

function encodePolicyId(policyId: string) {
  return encodeURIComponent(policyId)
}

function hasOpenApiOperation(
  document: OpenApiDocument,
  path: string,
  method: keyof OpenApiOperationMap,
) {
  return document.paths?.[path]?.[method] !== undefined
}

export const policyApi = {
  listPolicies: () => apiRequest<PolicyListResponse>('/api/policies'),
  getSummary: () => apiRequest<PolicySummaryResponse>('/api/policies/summary'),
  getEvents: () => apiRequest<PolicyEventsResponse>('/api/policies/events'),
  getDriftSummary: () =>
    apiRequest<PolicyDriftSummaryResponse>('/api/policies/drift'),
  getTemplateCapability: async (): Promise<PolicyTemplateCapability> => {
    try {
      const openApi = await apiRequest<OpenApiDocument>('/openapi.json')
      const createSupported = hasOpenApiOperation(
        openApi,
        '/api/policies/templates',
        'post',
      )
      const previewSupported = hasOpenApiOperation(
        openApi,
        '/api/policies/templates/preview',
        'post',
      )

      if (createSupported && previewSupported) {
        return {
          enabled: true,
          reason: null,
        }
      }
    } catch {
      // Fall through to the unavailable state below.
    }

    return {
      enabled: false,
      reason: 'Current backend does not expose template policy endpoints.',
    }
  },
  previewTemplate: (payload: PolicyTemplateRequest) =>
    apiRequest<PolicyPreview>('/api/policies/templates/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
  createTemplate: (payload: PolicyTemplateRequest) =>
    apiRequest<PolicyTemplateCreateResponse>('/api/policies/templates', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
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
  getDemoStatus: () =>
    apiRequest<DemoPolicyStatusResponse>('/api/policies/demo/block-ping/status'),
  recoverBaselineDemo: () =>
    apiRequest<Record<string, unknown>>('/api/policies/demo/recover-baseline', {
      method: 'POST',
    }),
}
