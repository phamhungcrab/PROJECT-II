import { useState } from 'react'
import { EmptyState } from '../state/EmptyState'
import { Panel } from '../ui/Panel'
import { StatusBadge } from '../ui/StatusBadge'
import { policyApi } from '../../services/api/policyApi'
import type { PolicyExecutionStatus, PolicyPreview, PolicyTemplateRequest } from '../../types/policy'
import { formatLabel } from '../../utils/formatters'

type TemplateProtocol = 'icmp' | 'tcp' | 'ipv4'
type TemplateDirection = 'one-way' | 'two-way'

interface PolicyTemplateBuilderPanelProps {
  onTemplateCreated: (policyId: string) => Promise<void>
}

interface PolicyTemplateBuilderUnavailablePanelProps {
  isChecking: boolean
  reason: string | null
}

interface TemplateFormState {
  name: string
  source_host: string
  destination_host: string
  protocol: TemplateProtocol
  port: string
  direction: TemplateDirection
  description: string
}

const TEMPLATE_TYPE = 'safe_host_traffic_block_v1'
const HOST_OPTIONS = [
  { id: 'h1', label: 'H1', ip: '10.0.0.1' },
  { id: 'h2', label: 'H2', ip: '10.0.0.2' },
] as const

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected template request failure.'
}

function getExecutionTone(
  executionStatus: PolicyExecutionStatus,
): 'success' | 'warning' {
  return executionStatus === 'SUPPORTED' ? 'success' : 'warning'
}

function getExecutionLabel(executionStatus: PolicyExecutionStatus) {
  return executionStatus === 'SUPPORTED' ? 'Live Mapped' : 'Preview Only'
}

function formatState(value: string | null | undefined) {
  return value ? formatLabel(value) : 'N/A'
}

function getPreviewExecutionStatus(preview: PolicyPreview | null | undefined) {
  return preview?.execution_status === 'PREVIEW_ONLY'
    ? 'PREVIEW_ONLY'
    : 'SUPPORTED'
}

function getPreviewExecutionReason(preview: PolicyPreview | null | undefined) {
  return preview?.execution_reason ?? null
}

function getGeneratedPolicyShape(preview: PolicyPreview | null | undefined) {
  return preview?.generated_policy_shape ?? preview?.policy ?? null
}

function getPreviewNotes(preview: PolicyPreview | null | undefined) {
  return Array.isArray(preview?.notes) ? preview.notes : []
}

function getPreviewExpectedFlowLabels(
  preview: PolicyPreview | null | undefined,
) {
  return Array.isArray(preview?.expected_flow_labels)
    ? preview.expected_flow_labels
    : []
}

function getPreviewExpectedCookies(preview: PolicyPreview | null | undefined) {
  return Array.isArray(preview?.expected_cookies) ? preview.expected_cookies : []
}

function buildTemplatePayload(form: TemplateFormState): PolicyTemplateRequest {
  return {
    name: form.name.trim(),
    template_type: TEMPLATE_TYPE,
    source_host: form.source_host,
    destination_host: form.destination_host,
    protocol: form.protocol,
    port:
      form.protocol === 'tcp' && form.port.trim().length > 0
        ? Number(form.port)
        : null,
    direction: form.direction,
    action: 'block',
    description: form.description.trim().length > 0 ? form.description.trim() : null,
  }
}

export function PolicyTemplateBuilderPanel({
  onTemplateCreated,
}: PolicyTemplateBuilderPanelProps) {
  const [form, setForm] = useState<TemplateFormState>({
    name: '',
    source_host: 'h1',
    destination_host: 'h2',
    protocol: 'icmp',
    port: '',
    direction: 'two-way',
    description: '',
  })
  const [preview, setPreview] = useState<PolicyPreview | null>(null)
  const [previewKey, setPreviewKey] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState<'preview' | 'create' | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [builderMessage, setBuilderMessage] = useState<string | null>(null)

  const payload = buildTemplatePayload(form)
  const currentKey = JSON.stringify(payload)
  const previewIsStale = previewKey !== null && previewKey !== currentKey
  const createDisabled = loadingAction !== null || preview === null || previewIsStale
  const previewExecutionStatus = getPreviewExecutionStatus(preview)
  const previewExecutionReason = getPreviewExecutionReason(preview)
  const generatedPolicyShape = getGeneratedPolicyShape(preview)
  const previewNotes = getPreviewNotes(preview)
  const previewExpectedFlowLabels = getPreviewExpectedFlowLabels(preview)
  const previewExpectedCookies = getPreviewExpectedCookies(preview)

  async function handlePreview() {
    setLoadingAction('preview')
    setPreviewError(null)
    setCreateError(null)
    setBuilderMessage(null)

    try {
      const nextPreview = await policyApi.previewTemplate(payload)
      setPreview(nextPreview)
      setPreviewKey(currentKey)
    } catch (error) {
      setPreviewError(getErrorMessage(error))
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleCreate() {
    if (createDisabled) {
      return
    }

    setLoadingAction('create')
    setCreateError(null)
    setBuilderMessage(null)

    try {
      const response = await policyApi.createTemplate(payload)
      setPreview(response.preview)
      setPreviewKey(currentKey)
      setBuilderMessage(`Created ${response.policy.name} in Policy Center inventory.`)
      await onTemplateCreated(response.policy.id)
    } catch (error) {
      setCreateError(getErrorMessage(error))
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="content-grid content-grid--two">
      <Panel
        title="Policy Template Builder"
        description="Create constrained policy objects from the current safe template set without authoring generic OpenFlow rules."
      >
        <div className="query-form">
          <div className="field-group">
            <span>Policy name</span>
            <input
              className="input-field"
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder="Block Ping Between Demo Hosts"
            />
          </div>

          <div className="metadata-grid">
            <label className="field-group">
              <span>Source host</span>
              <select
                className="input-field"
                value={form.source_host}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    source_host: event.target.value,
                  }))
                }
              >
                {HOST_OPTIONS.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.label} ({host.ip})
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              <span>Destination host</span>
              <select
                className="input-field"
                value={form.destination_host}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    destination_host: event.target.value,
                  }))
                }
              >
                {HOST_OPTIONS.map((host) => (
                  <option key={host.id} value={host.id}>
                    {host.label} ({host.ip})
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              <span>Action</span>
              <select className="input-field" value="block" disabled>
                <option value="block">Block</option>
              </select>
            </label>
          </div>

          <div className="metadata-grid">
            <label className="field-group">
              <span>Protocol</span>
              <select
                className="input-field"
                value={form.protocol}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    protocol: event.target.value as TemplateProtocol,
                    port:
                      event.target.value === 'tcp'
                        ? current.port
                        : '',
                  }))
                }
              >
                <option value="icmp">ICMP</option>
                <option value="tcp">TCP</option>
                <option value="ipv4">IPv4</option>
              </select>
            </label>

            <label className="field-group">
              <span>Port</span>
              <input
                className="input-field"
                type="number"
                min="1"
                max="65535"
                value={form.port}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    port: event.target.value,
                  }))
                }
                placeholder={form.protocol === 'tcp' ? '80' : 'TCP only'}
                disabled={form.protocol !== 'tcp'}
              />
            </label>

            <label className="field-group">
              <span>Direction</span>
              <select
                className="input-field"
                value={form.direction}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    direction: event.target.value as TemplateDirection,
                  }))
                }
              >
                <option value="one-way">One-way</option>
                <option value="two-way">Two-way</option>
              </select>
            </label>
          </div>

          <label className="field-group">
            <span>Description</span>
            <textarea
              className="input-field"
              rows={4}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Optional operator note for why this template policy exists."
              style={{ resize: 'vertical', minHeight: '112px' }}
            />
          </label>

          <div className="metadata-item">
            <span className="metadata-label">Builder Scope</span>
            <p className="entity-list-meta" style={{ marginTop: '10px' }}>
              v1 only supports safe demo-host traffic blocks. Supported live mappings
              currently exist for ICMP, TCP/80, and IPv4 two-way blocks on the
              H1/H2 pair.
            </p>
          </div>

          {previewError ? (
            <div className="notice notice--warning">{previewError}</div>
          ) : null}

          {createError ? (
            <div className="notice notice--warning">{createError}</div>
          ) : null}

          {builderMessage ? (
            <p className="entity-list-meta">{builderMessage}</p>
          ) : null}

          <div className="form-actions">
            <button
              className="button"
              type="button"
              onClick={() => void handlePreview()}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'preview' ? 'Generating Preview...' : 'Generate Preview'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void handleCreate()}
              disabled={createDisabled}
            >
              {loadingAction === 'create' ? 'Creating...' : 'Create Policy Object'}
            </button>
          </div>
        </div>
      </Panel>

      <Panel
        title="Template Preview"
        description="Review intended enforcement, expected impact, affected target, and the generated policy shape before creating the policy object."
        action={
          preview ? (
            <StatusBadge
              label={getExecutionLabel(previewExecutionStatus)}
              tone={getExecutionTone(previewExecutionStatus)}
            />
          ) : null
        }
      >
        {!preview ? (
          <EmptyState
            title="No template preview yet"
            description="Fill the builder inputs and generate a preview to inspect the resulting policy object."
          />
        ) : (
          <>
            {previewIsStale ? (
              <div className="notice notice--warning" style={{ marginBottom: '16px' }}>
                Builder inputs changed after the current preview. Generate preview again
                before creating the policy object.
              </div>
            ) : null}

            <div className="mini-stats">
              <div className="mini-stat">
                <span>Execution</span>
                <strong>{getExecutionLabel(previewExecutionStatus)}</strong>
              </div>
              <div className="mini-stat">
                <span>Template type</span>
                <strong>{formatLabel(generatedPolicyShape?.template_type ?? 'n/a')}</strong>
              </div>
              <div className="mini-stat">
                <span>Action</span>
                <strong>{formatLabel(generatedPolicyShape?.action ?? 'block')}</strong>
              </div>
              <div className="mini-stat">
                <span>Direction</span>
                <strong>{formatLabel(generatedPolicyShape?.direction ?? 'n/a')}</strong>
              </div>
            </div>

            <div className="metadata-grid" style={{ marginTop: '16px' }}>
              <div className="metadata-item">
                <span className="metadata-label">Intended Enforcement</span>
                <strong className="metadata-value">{preview.mapped_enforcement_action}</strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Expected Impact</span>
                <strong className="metadata-value">{preview.expected_impact}</strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Affected Target</span>
                <strong className="metadata-value mono">{preview.affected_target}</strong>
              </div>
            </div>

            <div className="metadata-item" style={{ marginTop: '16px' }}>
              <span className="metadata-label">Generated Policy Shape</span>
              <div className="chip-row" style={{ marginTop: '12px' }}>
                <span className="chip">{generatedPolicyShape?.id ?? 'template-preview'}</span>
                <span className="chip">
                  {formatLabel(generatedPolicyShape?.type ?? 'template')}
                </span>
                <span className="chip">
                  {generatedPolicyShape?.source_host ?? 'n/a'} to{' '}
                  {generatedPolicyShape?.destination_host ?? 'n/a'}
                </span>
                <span className="chip">
                  {formatLabel(generatedPolicyShape?.protocol ?? 'n/a')}
                </span>
                {generatedPolicyShape?.port !== null &&
                generatedPolicyShape?.port !== undefined ? (
                  <span className="chip">Port {generatedPolicyShape.port}</span>
                ) : null}
                <span className="chip">
                  Desired {formatState(generatedPolicyShape?.desired_state)}
                </span>
                <span className="chip">
                  Live {formatState(generatedPolicyShape?.live_state)}
                </span>
                <span className="chip">
                  Compliance {formatState(generatedPolicyShape?.compliance)}
                </span>
              </div>
            </div>

            <div className="content-grid" style={{ marginTop: '16px' }}>
              <div className="metadata-item">
                <span className="metadata-label">Risk</span>
                <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                  {preview.risk}
                </p>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Support Notes</span>
                <div className="chip-row" style={{ marginTop: '12px' }}>
                  {previewNotes.map((note) => (
                    <span key={note} className="chip">
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {previewExecutionReason ? (
              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Execution Status</span>
                <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                  {previewExecutionReason}
                </p>
              </div>
            ) : null}

            {preview.mapping_reference_policy_id ? (
              <div className="metadata-item" style={{ marginTop: '16px' }}>
                <span className="metadata-label">Current Mapping Reference</span>
                <div className="chip-row" style={{ marginTop: '12px' }}>
                  <span className="chip">{preview.mapping_reference_policy_id}</span>
                  {previewExpectedFlowLabels.map((label) => (
                    <span key={label} className="chip">
                      {label}
                    </span>
                  ))}
                  {previewExpectedCookies.map((cookie) => (
                    <span key={cookie} className="chip">
                      {cookie}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </Panel>
    </div>
  )
}

export function PolicyTemplateBuilderUnavailablePanel({
  isChecking,
  reason,
}: PolicyTemplateBuilderUnavailablePanelProps) {
  const unavailableTitle = isChecking
    ? 'Checking deployment capability'
    : 'Policy Template Builder is not enabled on this deployment.'
  const unavailableDescription = isChecking
    ? 'Policy Center is checking whether the current backend exposes the template policy endpoints before enabling create and preview controls.'
    : reason ?? 'Current backend does not expose template policy endpoints.'

  return (
    <div className="content-grid content-grid--two">
      <Panel
        title="Policy Template Builder"
        description="Create constrained policy objects from the current safe template set without authoring generic OpenFlow rules."
      >
        <EmptyState
          title={unavailableTitle}
          description={unavailableDescription}
        />
      </Panel>

      <Panel
        title="Template Preview"
        description="Review intended enforcement, expected impact, affected target, and the generated policy shape before creating the policy object."
      >
        <EmptyState
          title={isChecking ? 'Waiting for backend capability check' : 'Template preview unavailable'}
          description={
            isChecking
              ? 'Template preview will remain hidden until Policy Center confirms that the deployment supports template policy endpoints.'
              : 'Current backend does not expose template policy preview endpoints, so preview controls are hidden on this deployment.'
          }
        />
      </Panel>
    </div>
  )
}
