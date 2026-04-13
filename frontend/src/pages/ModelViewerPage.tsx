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

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger'

interface ModelViewerData {
  health: Awaited<ReturnType<typeof sdnApi.getHealth>> | null
  healthError: string | null
  inventory: Awaited<ReturnType<typeof sdnApi.getInventoryNodes>> | null
  inventoryError: string | null
  topology: Awaited<ReturnType<typeof sdnApi.getTopologySummary>> | null
  topologyError: string | null
  raw: Awaited<ReturnType<typeof sdnApi.getTopologyRaw>> | null
  rawError: string | null
  refreshedAt: string
}

interface ModelField {
  label: string
  value: string
  detail: string
  mono?: boolean
  tags?: string[]
}

interface ModelGroup {
  id: string
  title: string
  summary: string
  openByDefault?: boolean
  fields: ModelField[]
}

interface DifferenceHint {
  label: string
  tone: StatusTone
  summary: string
}

function loadSource<T>(loader: () => Promise<T>) {
  return loader()
    .then((data) => ({
      data,
      error: null,
    }))
    .catch((error: unknown) => ({
      data: null,
      error: error instanceof Error ? error.message : 'Unexpected data source failure.',
    }))
}

function getFreshnessStatus(
  timestamp: string | null | undefined,
  checkedAt: string,
) {
  if (!timestamp) {
    return {
      label: 'Partial snapshot',
      tone: 'warning' as const,
      detail:
        'Freshness is based on the current page capture because no node-level snapshot timestamp is available.',
    }
  }

  const parsedTimestamp = new Date(timestamp)
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return {
      label: 'Partial snapshot',
      tone: 'warning' as const,
      detail: 'The snapshot timestamp is present but could not be parsed reliably.',
    }
  }

  const checkedDate = new Date(checkedAt)
  const referenceTime = Number.isNaN(checkedDate.getTime())
    ? Date.now()
    : checkedDate.getTime()
  const ageInMinutes = (referenceTime - parsedTimestamp.getTime()) / 60_000

  if (ageInMinutes <= 5) {
    return {
      label: 'Fresh',
      tone: 'success' as const,
      detail: 'The selected node snapshot is recent enough for a defense-friendly operational readout.',
    }
  }

  if (ageInMinutes <= 30) {
    return {
      label: 'Recent',
      tone: 'warning' as const,
      detail: 'The model projection is recent, but not near-real-time.',
    }
  }

  return {
    label: 'Stale',
    tone: 'danger' as const,
    detail: 'The selected node snapshot is old enough that counters or visibility may no longer reflect the live device state.',
  }
}

function getModelScope(nodeId: string | null) {
  if (!nodeId) {
    return 'Read-only controller/device state projection'
  }

  if (nodeId.startsWith('openflow:')) {
    return 'Read-only YANG-lite switch projection'
  }

  if (nodeId.startsWith('host:')) {
    return 'Read-only host attachment projection'
  }

  return 'Read-only controller/device state projection'
}

function getSourceTypeLabel(nodeId: string | null) {
  if (!nodeId) {
    return 'Controller-linked node projection'
  }

  if (nodeId.startsWith('openflow:')) {
    return 'OpenFlow switch projection'
  }

  if (nodeId.startsWith('host:')) {
    return 'Host attachment projection'
  }

  return 'Controller-linked node projection'
}

function getModelConfidenceStatus(
  hasInventoryView: boolean,
  hasTopologyView: boolean,
  hasRawView: boolean,
) {
  if (hasInventoryView && hasTopologyView && hasRawView) {
    return {
      label: 'Partial model snapshot',
      tone: 'success' as const,
      detail:
        'Inventory, topology, and raw controller linkage are all present, but this remains a read-only YANG-lite projection rather than a full NETCONF datastore view.',
    }
  }

  if (hasInventoryView && (hasTopologyView || hasRawView)) {
    return {
      label: 'Partial model snapshot',
      tone: 'warning' as const,
      detail:
        'Config-like and operational-like fields are both visible, but the snapshot remains intentionally partial and controller-derived.',
    }
  }

  if (hasInventoryView) {
    return {
      label: 'Config-light snapshot',
      tone: 'warning' as const,
      detail:
        'Inventory identity is available, but topology or raw lineage is limited for the selected node.',
    }
  }

  if (hasTopologyView || hasRawView) {
    return {
      label: 'Observational only',
      tone: 'warning' as const,
      detail:
        'Operational presence is visible, but inventory-backed config-like projection is limited or absent.',
    }
  }

  return {
    label: 'Unavailable',
    tone: 'danger' as const,
    detail: 'No structured controller/device projection is currently available for this selection.',
  }
}

function getNodeOptionLabel(nodeId: string) {
  return `${classifyNode(nodeId)} · ${nodeId}`
}

function getStatusValue(value: boolean) {
  return value ? 'Observed' : 'Unavailable'
}

function getDifferenceHints(params: {
  hasInventoryView: boolean
  hasTopologyView: boolean
  hasRawView: boolean
  hasNamedConfig: boolean
  hasCounters: boolean
  hasInventoryReference: boolean
  hasSnapshotTimestamp: boolean
}) {
  const hints: DifferenceHint[] = []

  if (params.hasInventoryView && (params.hasTopologyView || params.hasRawView)) {
    hints.push({
      label: 'Aligned',
      tone: 'success',
      summary:
        'Config-like identity and operational visibility are both present for the selected node, so the YANG-lite projection is structurally consistent.',
    })
  } else if (params.hasInventoryView) {
    hints.push({
      label: 'Config-light snapshot',
      tone: 'warning',
      summary:
        'Inventory identity is present, but topology-side or raw controller visibility is limited for the current selection.',
    })
  } else if (params.hasTopologyView || params.hasRawView) {
    hints.push({
      label: 'Observational only',
      tone: 'warning',
      summary:
        'The selected node is visible operationally, but the config-like inventory projection is thin or absent.',
    })
  }

  if (params.hasCounters && !params.hasNamedConfig) {
    hints.push({
      label: 'Observational only',
      tone: 'warning',
      summary:
        'Operational counters are visible even though the config-like metadata is still light, which is typical for a controller/device state projection.',
    })
  }

  if (params.hasInventoryReference && !params.hasSnapshotTimestamp) {
    hints.push({
      label: 'Partial',
      tone: 'warning',
      summary:
        'Inventory linkage exists, but the node-level freshness signal falls back to the page capture rather than a device snapshot timestamp.',
    })
  }

  if (hints.length === 0) {
    hints.push({
      label: 'Partial',
      tone: 'warning',
      summary:
        'The selected node is only partially represented, so this page remains a safe read-only model projection rather than a complete model datastore view.',
    })
  }

  return hints.slice(0, 4)
}

function ModelFieldList({ fields }: { fields: ModelField[] }) {
  if (fields.length === 0) {
    return (
      <p className="entity-list-meta" style={{ marginTop: '12px' }}>
        No projected model fields are available for this section in the current snapshot.
      </p>
    )
  }

  return (
    <div className="model-field-list">
      {fields.map((field) => (
        <div key={field.label} className="model-field-row">
          <div>
            <span className="model-field-key">{field.label}</span>
            <p className="model-field-detail">{field.detail}</p>
            {field.tags && field.tags.length > 0 ? (
              <div className="chip-row" style={{ marginTop: '8px' }}>
                {field.tags.map((tag) => (
                  <span key={`${field.label}-${tag}`} className="chip">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <strong className={`model-field-value${field.mono ? ' mono' : ''}`}>
            {field.value}
          </strong>
        </div>
      ))}
    </div>
  )
}

function ModelGroupDetails({ group }: { group: ModelGroup }) {
  return (
    <details className="model-section-details" open={group.openByDefault}>
      <summary className="model-section-summary">
        <div>
          <strong className="model-section-title">{group.title}</strong>
          <p className="model-section-copy">{group.summary}</p>
        </div>
      </summary>
      <div className="model-section-body">
        <ModelFieldList fields={group.fields} />
      </div>
    </details>
  )
}

export function ModelViewerPage() {
  const { defenseMode } = useDefenseMode()
  const [selectedNodeId, setSelectedNodeId] = useState('')

  const { data, error, isLoading, reload } = useApiResource<ModelViewerData>(
    async () => {
      const [health, inventory, topology, raw] = await Promise.all([
        loadSource(() => sdnApi.getHealth()),
        loadSource(() => sdnApi.getInventoryNodes()),
        loadSource(() => sdnApi.getTopologySummary()),
        loadSource(() => sdnApi.getTopologyRaw()),
      ])

      if (!health.data && !inventory.data && !topology.data && !raw.data) {
        throw new Error(
          [
            health.error,
            inventory.error,
            topology.error,
            raw.error,
          ]
            .filter((message): message is string => Boolean(message))
            .join(' | ') || 'Unable to load read-only model snapshot sources.',
        )
      }

      return {
        health: health.data,
        healthError: health.error,
        inventory: inventory.data,
        inventoryError: inventory.error,
        topology: topology.data,
        topologyError: topology.error,
        raw: raw.data,
        rawError: raw.error,
        refreshedAt: new Date().toISOString(),
      }
    },
    [],
  )

  const rawTopology = data?.raw?.['network-topology:topology']?.[0] ?? null
  const selectableNodeIds = useMemo(() => {
    const inventoryNodeIds = data?.inventory?.nodes.map((node) => node.node_id) ?? []
    const topologyNodeIds = data?.topology?.nodes.map((node) => node.node_id) ?? []
    const rawNodeIds = rawTopology?.node?.map((node) => node['node-id']) ?? []

    return Array.from(
      new Set([...inventoryNodeIds, ...topologyNodeIds, ...rawNodeIds]),
    ).sort((left, right) => {
      if (left === appConfig.defaultFlowNodeId) {
        return -1
      }

      if (right === appConfig.defaultFlowNodeId) {
        return 1
      }

      const leftType = classifyNode(left)
      const rightType = classifyNode(right)
      if (leftType !== rightType) {
        return leftType.localeCompare(rightType)
      }

      return left.localeCompare(right)
    })
  }, [data?.inventory?.nodes, data?.topology?.nodes, rawTopology?.node])

  const defaultNodeId =
    selectableNodeIds.find((nodeId) => nodeId === appConfig.defaultFlowNodeId) ??
    selectableNodeIds[0] ??
    ''
  const firstHostNodeId =
    selectableNodeIds.find((nodeId) => nodeId.startsWith('host:')) ?? ''
  const effectiveSelectedNodeId = selectedNodeId || defaultNodeId

  const rawNodeMap = useMemo(
    () =>
      new Map((rawTopology?.node ?? []).map((node) => [node['node-id'], node])),
    [rawTopology],
  )
  const topologyNodeMap = useMemo(
    () =>
      new Map(data?.topology?.nodes.map((node) => [node.node_id, node]) ?? []),
    [data?.topology?.nodes],
  )
  const inventoryNodeMap = useMemo(
    () =>
      new Map(data?.inventory?.nodes.map((node) => [node.node_id, node]) ?? []),
    [data?.inventory?.nodes],
  )

  const selectedInventoryNode = inventoryNodeMap.get(effectiveSelectedNodeId) ?? null
  const selectedTopologyNode = topologyNodeMap.get(effectiveSelectedNodeId) ?? null
  const selectedRawNode = rawNodeMap.get(effectiveSelectedNodeId) ?? null
  const selectedNodeType = effectiveSelectedNodeId
    ? classifyNode(effectiveSelectedNodeId)
    : 'Node'
  const sourceTypeLabel = getSourceTypeLabel(effectiveSelectedNodeId || null)
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
  const freshnessStatus = getFreshnessStatus(snapshotTimestamp, data?.refreshedAt ?? '')
  const hasInventoryView = Boolean(selectedInventoryNode)
  const hasTopologyView = Boolean(selectedTopologyNode)
  const hasRawView = Boolean(selectedRawNode)
  const modelConfidenceStatus = getModelConfidenceStatus(
    hasInventoryView,
    hasTopologyView,
    hasRawView,
  )
  const sourceLineage = [
    data?.health ? 'Controller-derived' : null,
    hasInventoryView ? 'Inventory-derived' : null,
    hasTopologyView ? 'Topology-derived' : null,
    hasRawView ? 'Raw topology-derived' : null,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
  const hasNamedConfig = Boolean(
    selectedInventoryNode?.description ||
      selectedInventoryNode?.manufacturer ||
      selectedInventoryNode?.software ||
      selectedInventoryNode?.serial_number ||
      selectedInventoryNode?.ip_address,
  )
  const connectors = selectedInventoryNode?.connectors ?? []
  const hasCounters = connectors.some(
    (connector) =>
      connector.statistics?.packets?.received ||
      connector.statistics?.packets?.transmitted ||
      connector.statistics?.bytes?.received ||
      connector.statistics?.bytes?.transmitted,
  )
  const connectorPacketText = connectors
    .map((connector) =>
      formatPacketPair(
        connector.statistics?.packets?.received,
        connector.statistics?.packets?.transmitted,
      ),
    )
    .join(' · ')
  const connectorByteText = connectors
    .map((connector) =>
      formatBytePair(
        connector.statistics?.bytes?.received,
        connector.statistics?.bytes?.transmitted,
      ),
    )
    .join(' · ')
  const differenceHints = getDifferenceHints({
    hasInventoryView,
    hasTopologyView,
    hasRawView,
    hasNamedConfig,
    hasCounters,
    hasInventoryReference: Boolean(inventoryReference),
    hasSnapshotTimestamp: Boolean(snapshotTimestamp),
  })

  const configViewGroups: ModelGroup[] = [
    {
      id: 'system-identity',
      title: 'System Identity',
      summary:
        'Config-like identity and naming fields projected from the current inventory and topology linkage.',
      openByDefault: true,
      fields: [
        {
          label: 'Node ID',
          value: effectiveSelectedNodeId || 'No node selected',
          detail: 'Primary device identity used by the current controller snapshot.',
          mono: true,
          tags: ['Projected identity'],
        },
        {
          label: 'Node Type',
          value: selectedNodeType,
          detail: 'Derived from the controller-facing node identifier format.',
          tags: ['Classifier'],
        },
        {
          label: 'Description',
          value: formatValue(selectedInventoryNode?.description),
          detail: 'Inventory-derived descriptive field used as a config-like identity hint.',
          tags: ['Inventory-derived'],
        },
        {
          label: 'Manufacturer',
          value: formatValue(selectedInventoryNode?.manufacturer),
          detail: 'Inventory-derived vendor identity. This is a projection, not a NETCONF capability inventory.',
          tags: ['Inventory-derived'],
        },
        {
          label: 'Software',
          value: formatValue(selectedInventoryNode?.software),
          detail: 'Controller-visible software string from the current inventory view.',
          tags: ['Inventory-derived'],
        },
        {
          label: 'Management IP',
          value: formatValue(selectedInventoryNode?.ip_address),
          detail: 'Management-facing address when the inventory snapshot provides one.',
          tags: ['Config-like'],
        },
      ],
    },
    {
      id: 'bridge-role',
      title: 'Bridge Role / Intended Structure',
      summary:
        'Safe structure hints that describe how the selected node is represented rather than claiming a full config datastore.',
      fields: [
        {
          label: 'Projected Role',
          value:
            selectedNodeType === 'Switch'
              ? 'Bridge / switch structure'
              : selectedNodeType === 'Host'
                ? 'Host attachment structure'
                : 'Controller-linked structure',
          detail: 'Role is inferred from the selected node identity and currently visible inventory/topology data.',
          tags: ['YANG-lite'],
        },
        {
          label: 'Connector Count',
          value: formatNumber(selectedInventoryNode?.connector_count ?? 0),
          detail: 'Used here as an intended structure hint rather than a strict configuration statement.',
          tags: ['Config-light snapshot'],
        },
        {
          label: 'Inventory Reference',
          value: formatValue(inventoryReference),
          detail: 'Controller linkage between topology and inventory representations.',
          mono: true,
          tags: ['Evidence / linkage'],
        },
        {
          label: 'Serial Number',
          value: formatValue(selectedInventoryNode?.serial_number),
          detail: 'Hardware identity field when exposed by the current inventory snapshot.',
          tags: ['Inventory-derived'],
        },
      ],
    },
  ]

  const operationalViewGroups: ModelGroup[] = [
    {
      id: 'live-status',
      title: 'Live Status / Exposure',
      summary:
        'Operational-like state projected from controller health, topology visibility, and inventory counters.',
      openByDefault: true,
      fields: [
        {
          label: 'Controller Status',
          value: data?.health?.status ? formatValue(data.health.status) : 'Unavailable',
          detail: 'Controller reachability for the current model snapshot request.',
          tags: ['Controller-derived'],
        },
        {
          label: 'Topology Presence',
          value: getStatusValue(hasTopologyView || hasRawView),
          detail: 'Whether the selected node is visible in topology-oriented sources.',
          tags: ['Topology-derived'],
        },
        {
          label: 'Flow Exposure',
          value: formatNumber(selectedInventoryNode?.flow_count ?? 0),
          detail: 'Number of controller-exposed flows for the selected inventory node.',
          tags: ['Operational-like'],
        },
        {
          label: 'Table Exposure',
          value: formatNumber(selectedInventoryNode?.table_count ?? 0),
          detail: 'Visible OpenFlow table count for the selected inventory node.',
          tags: ['Operational-like'],
        },
        {
          label: 'Attachment Points',
          value: formatNumber(attachmentPoints.length),
          detail: 'Observed attachment points from raw topology linkage.',
          tags: ['Observational'],
        },
        {
          label: 'Known Addresses',
          value: formatNumber(addresses.length),
          detail: 'Observed address count for host-oriented raw topology entries.',
          tags: ['Observational'],
        },
      ],
    },
    {
      id: 'freshness-counters',
      title: 'Freshness / Counters',
      summary:
        'Operational counters and freshness signals stay read-only and are presented as observational state rather than writable configuration.',
      fields: [
        {
          label: 'Snapshot Time',
          value: formatDateTime(snapshotTimestamp),
          detail: freshnessStatus.detail,
          tags: [freshnessStatus.label],
        },
        {
          label: 'Packet Counters',
          value: connectorPacketText || 'Unavailable',
          detail: 'Aggregated packet counters projected from connector statistics when present.',
          tags: ['Operational counters'],
        },
        {
          label: 'Byte Counters',
          value: connectorByteText || 'Unavailable',
          detail: 'Aggregated byte counters projected from connector statistics when present.',
          tags: ['Operational counters'],
        },
        {
          label: 'Termination Points',
          value: formatNumber(
            selectedTopologyNode?.termination_point_count ?? terminationPoints.length,
          ),
          detail: 'Observed topology-facing termination point count for the current selection.',
          tags: ['Topology-derived'],
        },
      ],
    },
  ]

  const explorerGroups: ModelGroup[] = [
    {
      id: 'system',
      title: 'system',
      summary:
        'Identity-oriented fields, source scope, and read-only safety context for the selected node projection.',
      openByDefault: true,
      fields: [
        {
          label: 'Model Scope',
          value: getModelScope(effectiveSelectedNodeId || null),
          detail: 'This page projects structured state without exposing configuration write operations.',
          tags: ['Read-only'],
        },
        {
          label: 'Source Type',
          value: sourceTypeLabel,
          detail: 'Derived from the selected node identity and the current controller-facing data sources.',
          tags: ['Controller/device state projection'],
        },
        {
          label: 'Model Confidence',
          value: modelConfidenceStatus.label,
          detail: modelConfidenceStatus.detail,
          tags: ['Honest completeness'],
        },
        {
          label: 'Source Lineage',
          value: sourceLineage.join(' / ') || 'Unavailable',
          detail: 'Lineage stays explicit so the operator can explain where this YANG-lite snapshot comes from.',
          tags: sourceLineage,
        },
      ],
    },
    {
      id: 'bridge-state',
      title: 'bridge / switch state',
      summary:
        'Controller-visible bridge or switch exposure, structure, and snapshot success indicators.',
      fields: [
        {
          label: 'Observed Installed Flows',
          value: formatNumber(selectedInventoryNode?.flow_count ?? 0),
          detail: 'Live flow exposure returned by the inventory snapshot.',
          tags: ['Operational-like'],
        },
        {
          label: 'Exposed Flow Tables',
          value: formatNumber(selectedInventoryNode?.table_count ?? 0),
          detail: 'OpenFlow table count from the current inventory response.',
          tags: ['Operational-like'],
        },
        {
          label: 'Connectors',
          value: formatNumber(selectedInventoryNode?.connector_count ?? 0),
          detail: 'Bridge or switch connector count projected from inventory.',
          tags: ['Inventory-derived'],
        },
        {
          label: 'Snapshot Succeeded',
          value: formatValue(selectedInventoryNode?.snapshot?.end?.succeeded),
          detail: 'Indicates whether the current inventory snapshot completed successfully.',
          tags: ['Controller-derived'],
        },
      ],
    },
    {
      id: 'interfaces',
      title: 'interfaces',
      summary:
        'Compact interface-oriented view that groups connector identity, state, and light configuration hints.',
      fields: connectors.slice(0, 8).map((connector) => ({
        label: connector.connector_id,
        value: connector.name ?? 'Unnamed interface',
        detail: `State ${formatConnectorState(connector.state)} · Port ${formatValue(
          connector.port_number,
        )}`,
        mono: true,
        tags: [
          connector.state?.live ? 'Operational' : 'Idle or partial',
          connector.configuration ? 'Config-like' : 'Operational-only',
        ],
      })),
    },
    {
      id: 'ports-connectors',
      title: 'ports / connectors',
      summary:
        'Port-oriented view for hardware address, numbering, and connector counter exposure.',
      fields: connectors.slice(0, 8).map((connector) => ({
        label: `Port ${formatValue(connector.port_number)}`,
        value: connector.hardware_address ?? 'No MAC',
        detail: `${formatPacketPair(
          connector.statistics?.packets?.received,
          connector.statistics?.packets?.transmitted,
        )} · ${formatBytePair(
          connector.statistics?.bytes?.received,
          connector.statistics?.bytes?.transmitted,
        )}`,
        mono: true,
        tags: ['Counters', connector.configuration ?? 'No config label'],
      })),
    },
    {
      id: 'control-plane-visibility',
      title: 'control-plane visibility',
      summary:
        'Presence and linkage across controller health, topology, raw topology, and inventory sources.',
      fields: [
        {
          label: 'Controller Type',
          value: data?.health?.controller.type ?? 'Unavailable',
          detail: 'Controller source used for this read-only projection.',
          tags: ['Controller-derived'],
        },
        {
          label: 'Topology Visibility',
          value: hasTopologyView ? 'Observed' : 'Not observed',
          detail: 'Whether the selected node appears in the summary topology view.',
          tags: ['Topology-derived'],
        },
        {
          label: 'Raw Topology Visibility',
          value: hasRawView ? 'Observed' : 'Not observed',
          detail: 'Whether the selected node appears in the raw topology projection.',
          tags: ['Raw topology-derived'],
        },
        {
          label: 'Inventory Visibility',
          value: hasInventoryView ? 'Observed' : 'Not observed',
          detail: 'Whether the selected node appears in the controller inventory snapshot.',
          tags: ['Inventory-derived'],
        },
      ],
    },
    {
      id: 'evidence-linkage',
      title: 'evidence / inventory linkage',
      summary:
        'Cross-links between inventory references, topology references, and snapshot timing for the current model projection.',
      fields: [
        {
          label: 'Inventory Reference',
          value: formatValue(inventoryReference),
          detail: 'Shared controller-side linkage between topology and inventory views.',
          mono: true,
          tags: ['Linkage'],
        },
        {
          label: 'Topology ID',
          value: data?.topology?.topology_id ?? 'Unavailable',
          detail: 'Current topology context used for this YANG-lite view.',
          tags: ['Topology-derived'],
        },
        {
          label: 'Page Capture',
          value: formatDateTime(data?.refreshedAt),
          detail: 'Time when this client-side model snapshot was assembled.',
          tags: ['Read-only capture'],
        },
        {
          label: 'Difference Hint',
          value: differenceHints[0]?.label ?? 'Partial',
          detail:
            differenceHints[0]?.summary ??
            'This node is represented as a partial read-only controller/device projection.',
          tags: ['Config vs operational'],
        },
      ],
    },
  ]

  const rawSnapshotJson = useMemo(
    () =>
      JSON.stringify(
        {
          selected_node: {
            id: effectiveSelectedNodeId || null,
            type: selectedNodeType,
            source_type: sourceTypeLabel,
            read_only_mode: true,
            model_scope: getModelScope(effectiveSelectedNodeId || null),
          },
          source_context: {
            page_capture: data?.refreshedAt ?? null,
            snapshot_timestamp: snapshotTimestamp,
            freshness: freshnessStatus.label,
            freshness_detail: freshnessStatus.detail,
            source_lineage: sourceLineage,
            model_confidence: modelConfidenceStatus.label,
          },
          config_view: {
            description: selectedInventoryNode?.description ?? null,
            manufacturer: selectedInventoryNode?.manufacturer ?? null,
            hardware: selectedInventoryNode?.hardware ?? null,
            software: selectedInventoryNode?.software ?? null,
            serial_number: selectedInventoryNode?.serial_number ?? null,
            management_ip: selectedInventoryNode?.ip_address ?? null,
            connector_count: selectedInventoryNode?.connector_count ?? null,
            inventory_reference: inventoryReference,
          },
          operational_view: {
            controller_status: data?.health?.status ?? null,
            topology_visible: hasTopologyView,
            raw_topology_visible: hasRawView,
            inventory_visible: hasInventoryView,
            flow_count: selectedInventoryNode?.flow_count ?? null,
            table_count: selectedInventoryNode?.table_count ?? null,
            termination_point_count:
              selectedTopologyNode?.termination_point_count ?? terminationPoints.length,
            attachment_point_count: attachmentPoints.length,
            address_count: addresses.length,
          },
          difference_hints: differenceHints,
        },
        null,
        2,
      ),
    [
      addresses.length,
      attachmentPoints.length,
      data?.health?.status,
      data?.refreshedAt,
      differenceHints,
      effectiveSelectedNodeId,
      freshnessStatus.detail,
      freshnessStatus.label,
      hasInventoryView,
      hasRawView,
      hasTopologyView,
      inventoryReference,
      modelConfidenceStatus.label,
      selectedInventoryNode?.connector_count,
      selectedInventoryNode?.description,
      selectedInventoryNode?.flow_count,
      selectedInventoryNode?.hardware,
      selectedInventoryNode?.ip_address,
      selectedInventoryNode?.manufacturer,
      selectedInventoryNode?.serial_number,
      selectedInventoryNode?.software,
      selectedInventoryNode?.table_count,
      selectedNodeType,
      selectedTopologyNode?.termination_point_count,
      snapshotTimestamp,
      sourceLineage,
      sourceTypeLabel,
      terminationPoints.length,
    ],
  )

  const sourceErrors = [
    data?.healthError,
    data?.inventoryError,
    data?.topologyError,
    data?.rawError,
  ].filter((value): value is string => Boolean(value))

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">NETCONF / YANG-lite Viewer</h2>
          <p className="section-copy">
            Read-only model-driven view built from current controller inventory,
            topology, and raw topology linkage. This page stays honest: it presents a
            partial YANG-lite projection rather than full NETCONF or writable
            datastore support.
          </p>
        </div>

        <button className="button" type="button" onClick={reload} disabled={isLoading}>
          Refresh model snapshot
        </button>
      </section>

      {isLoading && !data ? (
        <LoadingState
          label="Loading read-only controller and device model snapshot..."
          hint="Building the current YANG-lite projection from controller, topology, and inventory sources."
          variant="workspace"
        />
      ) : null}

      {error && !data ? (
        <ErrorState
          title="Model snapshot unavailable"
          message={error}
          onRetry={reload}
        />
      ) : null}

      {data ? (
        <>
          {error ? (
            <div className="notice notice--warning">
              Showing previously loaded model snapshot. Latest refresh failed: {error}
            </div>
          ) : null}

          {sourceErrors.length > 0 ? (
            <div className="notice notice--warning">
              Model Viewer is using partial source data: {sourceErrors.join(' | ')}
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Selected Node"
              value={
                <span className="mono">
                  {effectiveSelectedNodeId || 'No node selected'}
                </span>
              }
              helper="Current node or device projection in focus"
              tone="accent"
            />
            <StatCard
              label="Source Type"
              value={sourceTypeLabel}
              helper="Controller or device state projection type"
            />
            <StatCard
              label="Read-only Mode"
              value="Enabled"
              helper="No configuration write operations are exposed"
              tone="success"
            />
            <StatCard
              label="Data Freshness"
              value={freshnessStatus.label}
              helper={formatDateTime(snapshotTimestamp)}
            />
            <StatCard
              label="Model Confidence"
              value={modelConfidenceStatus.label}
              helper="Honest completeness badge for this YANG-lite view"
            />
          </div>

          <Panel
            title="Node / Model Context"
            description="Selected node context, source lineage, freshness, trust, and read-only scope for this controller/device state projection."
            action={
              <StatusBadge
                label={modelConfidenceStatus.label}
                tone={modelConfidenceStatus.tone}
              />
            }
            className={defenseMode ? 'panel--defense-primary' : undefined}
          >
            <div className="query-form">
              <div className="content-grid content-grid--two">
                <label className="field-group">
                  <span>Selected node / device</span>
                  <select
                    className="input-field mono"
                    value={effectiveSelectedNodeId}
                    onChange={(event) => setSelectedNodeId(event.target.value)}
                    disabled={selectableNodeIds.length === 0}
                  >
                    {selectableNodeIds.length === 0 ? (
                      <option value="">No nodes available</option>
                    ) : null}
                    {selectableNodeIds.map((nodeId) => (
                      <option key={nodeId} value={nodeId}>
                        {getNodeOptionLabel(nodeId)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="metadata-item">
                  <span className="metadata-label">Source Lineage</span>
                  <div className="chip-row" style={{ marginTop: '12px' }}>
                    {sourceLineage.length > 0 ? (
                      sourceLineage.map((lineage) => (
                        <span key={lineage} className="chip">
                          {lineage}
                        </span>
                      ))
                    ) : (
                      <span className="cell-muted">
                        No active source lineage is currently available.
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => setSelectedNodeId(defaultNodeId)}
                  disabled={!defaultNodeId}
                >
                  Use default switch
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => {
                    if (firstHostNodeId) {
                      setSelectedNodeId(firstHostNodeId)
                    }
                  }}
                  disabled={!firstHostNodeId}
                >
                  Use first host
                </button>
              </div>
            </div>

            <div className="model-context-grid" style={{ marginTop: '20px' }}>
              <div className="model-context-card">
                <span className="metadata-label">Selected node</span>
                <strong className="metadata-value mono">
                  {effectiveSelectedNodeId || 'No node selected'}
                </strong>
                <p className="entity-list-meta">Current device or node projection target.</p>
              </div>

              <div className="model-context-card">
                <span className="metadata-label">Source type</span>
                <strong className="metadata-value">{sourceTypeLabel}</strong>
                <p className="entity-list-meta">
                  Derived from the selected node identity and visible controller data.
                </p>
              </div>

              <div className="model-context-card">
                <span className="metadata-label">Read-only mode</span>
                <strong className="metadata-value">Read only</strong>
                <p className="entity-list-meta">
                  Safe for demo use. No config writes or device mutation paths are exposed.
                </p>
              </div>

              <div className="model-context-card">
                <span className="metadata-label">Data freshness</span>
                <strong className="metadata-value">{freshnessStatus.label}</strong>
                <p className="entity-list-meta">{freshnessStatus.detail}</p>
              </div>

              <div className="model-context-card">
                <span className="metadata-label">Source lineage</span>
                <strong className="metadata-value">
                  {sourceLineage.length > 0 ? sourceLineage.join(' / ') : 'Unavailable'}
                </strong>
                <p className="entity-list-meta">
                  Lineage is shown explicitly so the operator can explain the projection.
                </p>
              </div>

              <div className="model-context-card">
                <span className="metadata-label">Model confidence / completeness</span>
                <strong className="metadata-value">{modelConfidenceStatus.label}</strong>
                <p className="entity-list-meta">{modelConfidenceStatus.detail}</p>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: '18px' }}>
              <StatusBadge label={freshnessStatus.label} tone={freshnessStatus.tone} />
              <StatusBadge
                label={modelConfidenceStatus.label}
                tone={modelConfidenceStatus.tone}
              />
              <StatusBadge label="Read-only" tone="neutral" />
              {sourceLineage.includes('Inventory-derived') ? (
                <StatusBadge label="Inventory-derived" tone="neutral" />
              ) : null}
              {sourceLineage.includes('Topology-derived') ? (
                <StatusBadge label="Topology-derived" tone="neutral" />
              ) : null}
              {sourceLineage.includes('Controller-derived') ? (
                <StatusBadge label="Controller-derived" tone="neutral" />
              ) : null}
            </div>
          </Panel>

          {effectiveSelectedNodeId &&
          !selectedInventoryNode &&
          !selectedTopologyNode &&
          !selectedRawNode ? (
            <EmptyState
              title="No model snapshot for selected node"
              description="Choose a node currently visible in the inventory or topology-derived sources to inspect a read-only YANG-lite projection."
              eyebrow="Model scope"
            />
          ) : null}

          {selectedInventoryNode || selectedTopologyNode || selectedRawNode ? (
            <>
              <div className="content-grid content-grid--two">
                <Panel
                  title="Config View"
                  description="Config-like identity, naming, bridge role, and intended structure shown as a safe YANG-lite projection."
                  className={defenseMode ? 'panel--defense-primary' : undefined}
                  action={
                    <StatusBadge
                      label={
                        hasInventoryView ? 'Config-light snapshot' : 'Observational only'
                      }
                      tone={hasInventoryView ? 'warning' : 'danger'}
                    />
                  }
                >
                  <div className="content-grid">
                    {configViewGroups.map((group) => (
                      <div key={group.id} className="metadata-item">
                        <span className="metadata-label">{group.title}</span>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          {group.summary}
                        </p>
                        <ModelFieldList fields={group.fields} />
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel
                  title="Operational View"
                  description="Operational-like state for live status, counters, topology presence, connector count, and flow exposure."
                  className={defenseMode ? 'panel--defense-primary' : undefined}
                  action={
                    <StatusBadge label={freshnessStatus.label} tone={freshnessStatus.tone} />
                  }
                >
                  <div className="content-grid">
                    {operationalViewGroups.map((group) => (
                      <div key={group.id} className="metadata-item">
                        <span className="metadata-label">{group.title}</span>
                        <p className="entity-list-meta" style={{ marginTop: '10px' }}>
                          {group.summary}
                        </p>
                        <ModelFieldList fields={group.fields} />
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <Panel
                title="Config vs Operational Difference Hints"
                description="Simple difference labels help explain whether the current node looks aligned, partial, observational only, or config-light."
                action={
                  <StatusBadge
                    label={differenceHints[0]?.label ?? 'Partial'}
                    tone={differenceHints[0]?.tone ?? 'warning'}
                  />
                }
              >
                <ul className="entity-list">
                  {differenceHints.map((hint) => (
                    <li key={`${hint.label}-${hint.summary}`} className="entity-list-item">
                      <div>
                        <div className="entity-list-heading">
                          <strong>{hint.label}</strong>
                          <StatusBadge label={hint.label} tone={hint.tone} />
                        </div>
                        <p className="entity-list-meta">{hint.summary}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel
                title="Model Explorer v2"
                description="Grouped YANG-lite sections for system, bridge or switch state, interfaces, ports or connectors, control-plane visibility, and inventory linkage."
                className={defenseMode ? 'panel--defense-primary' : undefined}
              >
                <div className="model-section-grid">
                  {explorerGroups.map((group) => (
                    <ModelGroupDetails key={group.id} group={group} />
                  ))}
                </div>
              </Panel>

              <Panel
                title="Raw JSON Inspector"
                description="Hidden by default. Expand only when you need the compact pretty-printed model snapshot JSON for defense or evaluator discussion."
              >
                <details className="model-raw-inspector">
                  <summary className="model-section-summary">
                    <div>
                      <strong className="model-section-title">
                        Open raw model snapshot JSON
                      </strong>
                      <p className="model-section-copy">
                        This inspector shows the current read-only model projection for the
                        selected node. It does not expose configuration write paths.
                      </p>
                    </div>
                  </summary>
                  <div className="model-section-body">
                    <pre className="model-raw-pre">{rawSnapshotJson}</pre>
                  </div>
                </details>
              </Panel>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
