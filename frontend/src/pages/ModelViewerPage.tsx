import { useMemo, useState } from 'react'
import { useDefenseMode } from '../app/defenseMode'
import { appConfig } from '../config/appConfig'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { sdnApi } from '../services/api/sdnApi'
import {
  classifyNode,
  formatBytePair,
  formatConnectorState,
  formatDateTime,
  formatNumber,
  formatPacketPair,
  formatValue,
} from '../utils/formatters'

interface ModelViewerData {
  health: Awaited<ReturnType<typeof sdnApi.getHealth>>
  inventory: Awaited<ReturnType<typeof sdnApi.getInventoryNodes>>
  topology: Awaited<ReturnType<typeof sdnApi.getTopologySummary>>
  raw: Awaited<ReturnType<typeof sdnApi.getTopologyRaw>>
  refreshedAt: string
}

function getFreshnessStatus(timestamp: string | null | undefined) {
  if (!timestamp) {
    return {
      label: 'Partial snapshot',
      tone: 'warning' as const,
    }
  }

  const parsedTimestamp = new Date(timestamp)
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return {
      label: 'Snapshot captured',
      tone: 'warning' as const,
    }
  }

  const ageInMinutes = (Date.now() - parsedTimestamp.getTime()) / 60_000

  if (ageInMinutes <= 5) {
    return {
      label: 'Fresh',
      tone: 'success' as const,
    }
  }

  if (ageInMinutes <= 30) {
    return {
      label: 'Recent',
      tone: 'warning' as const,
    }
  }

  return {
    label: 'Stale snapshot',
    tone: 'danger' as const,
  }
}

function getAvailabilityStatus(
  hasInventoryView: boolean,
  hasTopologyView: boolean,
) {
  if (hasInventoryView && hasTopologyView) {
    return {
      label: 'Inventory + topology',
      tone: 'success' as const,
    }
  }

  if (hasInventoryView || hasTopologyView) {
    return {
      label: 'Partial snapshot',
      tone: 'warning' as const,
    }
  }

  return {
    label: 'Unavailable',
    tone: 'danger' as const,
  }
}

function getModelScope(nodeId: string | null) {
  if (!nodeId) {
    return 'Read-only controller/device state view'
  }

  if (nodeId.startsWith('openflow:')) {
    return 'Read-only YANG-lite switch state'
  }

  if (nodeId.startsWith('host:')) {
    return 'Read-only host attachment state'
  }

  return 'Read-only controller/device state view'
}

export function ModelViewerPage() {
  const { defenseMode } = useDefenseMode()
  const [nodeIdInput, setNodeIdInput] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState('')

  const { data, error, isLoading, reload } = useApiResource<ModelViewerData>(
    async () => {
      const [health, inventory, topology, raw] = await Promise.all([
        sdnApi.getHealth(),
        sdnApi.getInventoryNodes(),
        sdnApi.getTopologySummary(),
        sdnApi.getTopologyRaw(),
      ])

      return {
        health,
        inventory,
        topology,
        raw,
        refreshedAt: new Date().toISOString(),
      }
    },
    [],
  )

  const selectableNodeIds = useMemo(() => {
    if (!data) {
      return []
    }

    return Array.from(
      new Set([
        ...data.inventory.nodes.map((node) => node.node_id),
        ...data.topology.nodes.map((node) => node.node_id),
      ]),
    )
  }, [data])

  const defaultNodeId =
    selectableNodeIds.find((nodeId) => nodeId === appConfig.defaultFlowNodeId) ??
    selectableNodeIds[0] ??
    ''
  const effectiveSelectedNodeId = selectedNodeId || defaultNodeId

  const rawTopology = data?.raw['network-topology:topology']?.[0] ?? null
  const rawNodeMap = useMemo(
    () =>
      new Map(
        (rawTopology?.node ?? []).map((node) => [node['node-id'], node]),
      ),
    [rawTopology],
  )
  const topologyNodeMap = useMemo(
    () =>
      new Map(data?.topology.nodes.map((node) => [node.node_id, node]) ?? []),
    [data?.topology.nodes],
  )
  const inventoryNodeMap = useMemo(
    () =>
      new Map(data?.inventory.nodes.map((node) => [node.node_id, node]) ?? []),
    [data?.inventory.nodes],
  )

  const selectedInventoryNode = inventoryNodeMap.get(effectiveSelectedNodeId) ?? null
  const selectedTopologyNode = topologyNodeMap.get(effectiveSelectedNodeId) ?? null
  const selectedRawNode = rawNodeMap.get(effectiveSelectedNodeId) ?? null
  const selectedNodeType = effectiveSelectedNodeId
    ? classifyNode(effectiveSelectedNodeId)
    : 'Node'
  const attachmentPoints =
    selectedRawNode?.['host-tracker-service:attachment-points'] ?? []
  const addresses = selectedRawNode?.['host-tracker-service:addresses'] ?? []
  const terminationPoints = selectedRawNode?.['termination-point'] ?? []
  const inventoryReference =
    selectedRawNode?.['opendaylight-topology-inventory:inventory-node-ref'] ??
    selectedTopologyNode?.inventory_ref ??
    null
  const snapshotTimestamp =
    selectedInventoryNode?.snapshot?.end?.end ??
    selectedInventoryNode?.snapshot?.start?.begin ??
    null
  const freshnessStatus = getFreshnessStatus(snapshotTimestamp)
  const availabilityStatus = getAvailabilityStatus(
    Boolean(selectedInventoryNode),
    Boolean(selectedTopologyNode || selectedRawNode),
  )
  const connectorPacketText = selectedInventoryNode?.connectors
    .map((connector) =>
      formatPacketPair(
        connector.statistics?.packets?.received,
        connector.statistics?.packets?.transmitted,
      ),
    )
    .join(' · ')
  const connectorByteText = selectedInventoryNode?.connectors
    .map((connector) =>
      formatBytePair(
        connector.statistics?.bytes?.received,
        connector.statistics?.bytes?.transmitted,
      ),
    )
    .join(' · ')

  const handleNodeSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextNodeId = nodeIdInput.trim() || defaultNodeId
    if (!nextNodeId) {
      return
    }

    setSelectedNodeId(nextNodeId)
    setNodeIdInput(nextNodeId)
  }

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">NETCONF / YANG-lite Viewer</h2>
          <p className="section-copy">
            Read-only model snapshot built from current OpenDaylight inventory and
            topology data. This is a safe, partial controller/device state view,
            not full multi-vendor NETCONF coverage.
          </p>
        </div>

        <button className="button" type="button" onClick={reload} disabled={isLoading}>
          Refresh model snapshot
        </button>
      </section>

      {isLoading && !data ? (
        <LoadingState label="Loading read-only controller and device model snapshot..." />
      ) : null}

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          {error ? (
            <div className="notice notice--warning">
              Showing previously loaded model snapshot. Latest refresh failed: {error}
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Source Type"
              value={data.health.controller.type}
              helper="Inventory + topology read-only snapshot"
              tone="accent"
            />
            <StatCard
              label="Selected Node"
              value={
                <span className="mono">
                  {effectiveSelectedNodeId || 'No node selected'}
                </span>
              }
              helper={getModelScope(effectiveSelectedNodeId || null)}
            />
            <StatCard
              label="Read-only Mode"
              value="Enabled"
              helper="No configuration write operations exposed"
              tone="success"
            />
            <StatCard
              label="Last Refreshed"
              value={formatDateTime(data.refreshedAt)}
              helper={freshnessStatus.label}
            />
          </div>

          <Panel
            title="Model / Device Summary"
            description="Source availability, model scope, freshness, and selected device context for this partial model-driven view."
            action={
              <StatusBadge
                label={availabilityStatus.label}
                tone={availabilityStatus.tone}
              />
            }
            className={defenseMode ? 'panel--defense-primary' : undefined}
          >
            <form className="query-form" onSubmit={handleNodeSubmit}>
              <label className="field-group">
                <span>Node / device</span>
                <input
                  className="input-field mono"
                  list="model-viewer-node-options"
                  value={nodeIdInput}
                  onChange={(event) => setNodeIdInput(event.target.value)}
                  placeholder={appConfig.defaultFlowNodeId}
                />
              </label>

              <datalist id="model-viewer-node-options">
                {selectableNodeIds.map((nodeId) => (
                  <option key={nodeId} value={nodeId} />
                ))}
              </datalist>

              <div className="form-actions">
                <button className="button" type="submit">
                  Inspect node
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    const fallbackNodeId =
                      selectableNodeIds.find(
                        (nodeId) => nodeId === appConfig.defaultFlowNodeId,
                      ) ?? selectableNodeIds[0]

                    if (!fallbackNodeId) {
                      return
                    }

                    setSelectedNodeId(fallbackNodeId)
                    setNodeIdInput(fallbackNodeId)
                  }}
                >
                  Use default switch
                </button>
              </div>
            </form>

            <div className="metadata-grid" style={{ marginTop: '20px' }}>
              <div className="metadata-item">
                <span className="metadata-label">Source status</span>
                <strong className="metadata-value">
                  {data.health.status === 'ok' ? 'Available' : 'Unavailable'}
                </strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Read-only status</span>
                <strong className="metadata-value">Read only</strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Device / node name</span>
                <strong className="metadata-value mono">
                  {effectiveSelectedNodeId || 'No node selected'}
                </strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Model scope</span>
                <strong className="metadata-value">
                  {getModelScope(effectiveSelectedNodeId || null)}
                </strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Last refreshed</span>
                <strong className="metadata-value">
                  {formatDateTime(data.refreshedAt)}
                </strong>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Snapshot time</span>
                <strong className="metadata-value">
                  {formatDateTime(snapshotTimestamp)}
                </strong>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: '16px' }}>
              <StatusBadge
                label={data.health.status === 'ok' ? 'Source available' : 'Source unavailable'}
                tone={data.health.status === 'ok' ? 'success' : 'danger'}
              />
              <StatusBadge label={freshnessStatus.label} tone={freshnessStatus.tone} />
              <StatusBadge label="Read-only model view" tone="neutral" />
            </div>

            <p className="entity-list-meta" style={{ marginTop: '16px' }}>
              This page presents a controller/device state view using the current
              inventory and topology snapshot. It is intentionally partial and read
              only, so the operator can discuss model-driven management safely during
              the demo.
            </p>
          </Panel>

          {effectiveSelectedNodeId &&
          !selectedInventoryNode &&
          !selectedTopologyNode &&
          !selectedRawNode ? (
            <EmptyState
              title="No model snapshot for selected node"
              description="Choose a node returned by the current inventory or topology snapshot."
            />
          ) : null}

          {selectedInventoryNode || selectedTopologyNode || selectedRawNode ? (
            <>
              <div className="content-grid content-grid--two">
                <Panel
                  title="Config View"
                  description="Declarative and identity-oriented fields shown as a safe configuration-style snapshot."
                  className={defenseMode ? 'panel--defense-primary' : undefined}
                  action={<StatusBadge label="Read only" tone="neutral" />}
                >
                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <span className="metadata-label">Node ID</span>
                      <strong className="metadata-value mono">
                        {effectiveSelectedNodeId}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Node type</span>
                      <strong className="metadata-value">{selectedNodeType}</strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Inventory reference</span>
                      <strong className="metadata-value mono">
                        {formatValue(inventoryReference)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Description</span>
                      <strong className="metadata-value">
                        {formatValue(selectedInventoryNode?.description)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Manufacturer</span>
                      <strong className="metadata-value">
                        {formatValue(selectedInventoryNode?.manufacturer)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Hardware</span>
                      <strong className="metadata-value">
                        {formatValue(selectedInventoryNode?.hardware)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Software</span>
                      <strong className="metadata-value">
                        {formatValue(selectedInventoryNode?.software)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Serial number</span>
                      <strong className="metadata-value">
                        {formatValue(selectedInventoryNode?.serial_number)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Management IP</span>
                      <strong className="metadata-value">
                        {formatValue(selectedInventoryNode?.ip_address)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Configured connectors</span>
                      <strong className="metadata-value">
                        {formatNumber(selectedInventoryNode?.connector_count ?? 0)}
                      </strong>
                    </div>
                  </div>
                </Panel>

                <Panel
                  title="Operational View"
                  description="Live controller-facing operational state, counters, topology presence, and snapshot freshness."
                  className={defenseMode ? 'panel--defense-primary' : undefined}
                  action={
                    <StatusBadge label={freshnessStatus.label} tone={freshnessStatus.tone} />
                  }
                >
                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <span className="metadata-label">Controller status</span>
                      <strong className="metadata-value">
                        {data.health.status === 'ok' ? 'Operational' : 'Unavailable'}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Topology presence</span>
                      <strong className="metadata-value">
                        {selectedTopologyNode || selectedRawNode ? 'Observed' : 'Not observed'}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Flow count</span>
                      <strong className="metadata-value">
                        {formatNumber(selectedInventoryNode?.flow_count ?? 0)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Table count</span>
                      <strong className="metadata-value">
                        {formatNumber(selectedInventoryNode?.table_count ?? 0)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Connector count</span>
                      <strong className="metadata-value">
                        {formatNumber(selectedInventoryNode?.connector_count ?? 0)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Termination points</span>
                      <strong className="metadata-value">
                        {formatNumber(
                          selectedTopologyNode?.termination_point_count ??
                            terminationPoints.length,
                        )}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Attachment points</span>
                      <strong className="metadata-value">
                        {formatNumber(attachmentPoints.length)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Known addresses</span>
                      <strong className="metadata-value">
                        {formatNumber(addresses.length)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Packet counters</span>
                      <strong className="metadata-value">
                        {connectorPacketText || 'Unavailable'}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Byte counters</span>
                      <strong className="metadata-value">
                        {connectorByteText || 'Unavailable'}
                      </strong>
                    </div>
                  </div>
                </Panel>
              </div>

              <Panel
                title="Model Explorer"
                description="Grouped YANG-lite sections for system identity, interfaces, ports, and bridge or switch state."
                className={defenseMode ? 'panel--defense-primary' : undefined}
              >
                <div className="content-grid content-grid--two">
                  <div className="metadata-item">
                    <span className="metadata-label">system</span>
                    <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                      <div>
                        <strong className="metadata-value mono">
                          {effectiveSelectedNodeId}
                        </strong>
                        <p className="entity-list-meta">
                          {getModelScope(effectiveSelectedNodeId)}
                        </p>
                      </div>
                      <div>
                        <strong className="metadata-value">
                          {formatValue(selectedInventoryNode?.manufacturer)}
                        </strong>
                        <p className="entity-list-meta">Manufacturer</p>
                      </div>
                      <div>
                        <strong className="metadata-value">
                          {formatValue(selectedInventoryNode?.software)}
                        </strong>
                        <p className="entity-list-meta">Software</p>
                      </div>
                      <div>
                        <strong className="metadata-value">
                          {formatValue(selectedInventoryNode?.ip_address)}
                        </strong>
                        <p className="entity-list-meta">Management IP</p>
                      </div>
                    </div>
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">interfaces</span>
                    {selectedInventoryNode?.connectors.length ? (
                      <ul className="entity-list" style={{ marginTop: '12px' }}>
                        {selectedInventoryNode.connectors.slice(0, 6).map((connector) => (
                          <li key={connector.connector_id} className="entity-list-item">
                            <div>
                              <div className="entity-list-heading">
                                <span className="mono">{connector.connector_id}</span>
                                <StatusBadge
                                  label={formatConnectorState(connector.state)}
                                  tone={connector.state?.live ? 'success' : 'neutral'}
                                />
                              </div>
                              <p className="entity-list-meta">
                                {connector.name ?? 'Unnamed interface'}
                              </p>
                            </div>
                            <span className="entity-list-trailing mono">
                              {formatValue(connector.configuration)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        No interface snapshot is currently available for this node.
                      </p>
                    )}
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">ports</span>
                    {selectedInventoryNode?.connectors.length ? (
                      <ul className="entity-list" style={{ marginTop: '12px' }}>
                        {selectedInventoryNode.connectors.slice(0, 6).map((connector) => (
                          <li key={`${connector.connector_id}-port`} className="entity-list-item">
                            <div>
                              <div className="entity-list-heading">
                                <span className="mono">
                                  Port {formatValue(connector.port_number)}
                                </span>
                              </div>
                              <p className="entity-list-meta">
                                {formatPacketPair(
                                  connector.statistics?.packets?.received,
                                  connector.statistics?.packets?.transmitted,
                                )}
                              </p>
                              <p className="entity-list-meta">
                                {formatBytePair(
                                  connector.statistics?.bytes?.received,
                                  connector.statistics?.bytes?.transmitted,
                                )}
                              </p>
                            </div>
                            <span className="entity-list-trailing mono">
                              {connector.hardware_address ?? 'No MAC'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
                        Port-level counters are unavailable for this node snapshot.
                      </p>
                    )}
                  </div>

                  <div className="metadata-item">
                    <span className="metadata-label">bridge / switch state</span>
                    <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                      <div>
                        <strong className="metadata-value">
                          {formatNumber(selectedInventoryNode?.flow_count ?? 0)}
                        </strong>
                        <p className="entity-list-meta">Observed installed flows</p>
                      </div>
                      <div>
                        <strong className="metadata-value">
                          {formatNumber(selectedInventoryNode?.table_count ?? 0)}
                        </strong>
                        <p className="entity-list-meta">Exposed flow tables</p>
                      </div>
                      <div>
                        <strong className="metadata-value">
                          {formatNumber(
                            selectedTopologyNode?.termination_point_count ??
                              terminationPoints.length,
                          )}
                        </strong>
                        <p className="entity-list-meta">Topology termination points</p>
                      </div>
                      <div>
                        <strong className="metadata-value">
                          {formatValue(selectedInventoryNode?.snapshot?.end?.succeeded)}
                        </strong>
                        <p className="entity-list-meta">Snapshot succeeded</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
