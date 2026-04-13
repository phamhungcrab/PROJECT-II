export interface HealthResponse {
  status: string
  service: string
  version: string
  controller: {
    type: string
    base_url: string
    topology_id: string
  }
}

export interface TopologySummaryNode {
  node_id: string
  inventory_ref: string | null
  termination_point_count: number
}

export interface TopologySummaryLink {
  link_id: string
  source_node: string
  source_tp: string
  destination_node: string
  destination_tp: string
}

export interface TopologySummaryResponse {
  topology_id: string
  node_count: number
  switch_count: number
  host_count: number
  link_count: number
  termination_point_count: number
  nodes: TopologySummaryNode[]
  links: TopologySummaryLink[]
}

export interface HostTrackerAddress {
  id: string
  ip?: string
  mac?: string
  'first-seen'?: string
  'last-seen'?: string
}

export interface HostAttachmentPoint {
  'tp-id': string
  'corresponding-tp'?: string
  active?: boolean
}

export interface RawTerminationPoint {
  'tp-id': string
  'opendaylight-topology-inventory:inventory-node-connector-ref'?: string
}

export interface RawTopologyNode {
  'node-id': string
  'host-tracker-service:id'?: string
  'host-tracker-service:addresses'?: HostTrackerAddress[]
  'host-tracker-service:attachment-points'?: HostAttachmentPoint[]
  'termination-point'?: RawTerminationPoint[]
  'opendaylight-topology-inventory:inventory-node-ref'?: string
}

export interface RawTopologyLink {
  'link-id': string
  source: {
    'source-node': string
    'source-tp': string
  }
  destination: {
    'dest-node': string
    'dest-tp': string
  }
}

export interface RawTopologyEntry {
  'topology-id': string
  node?: RawTopologyNode[]
  link?: RawTopologyLink[]
}

export interface TopologyRawResponse {
  'network-topology:topology'?: RawTopologyEntry[]
}

export interface InventorySnapshot {
  start?: {
    begin?: string
  }
  end?: {
    succeeded?: boolean
    end?: string
  }
}

export interface ConnectorState {
  live?: boolean
  blocked?: boolean
  'link-down'?: boolean
}

export interface ConnectorStatistics {
  'receive-drops'?: string
  'transmit-drops'?: string
  'receive-frame-error'?: string
  'collision-count'?: string
  'receive-over-run-error'?: string
  'receive-errors'?: string
  'transmit-errors'?: string
  'receive-crc-error'?: string
  packets?: {
    received?: string
    transmitted?: string
  }
  bytes?: {
    received?: string
    transmitted?: string
  }
}

export interface InventoryConnector {
  connector_id: string
  name: string | null
  port_number: number | null
  hardware_address: string | null
  state?: ConnectorState
  configuration?: string | null
  statistics?: ConnectorStatistics
}

export interface InventoryNode {
  node_id: string
  manufacturer: string | null
  hardware: string | null
  software: string | null
  serial_number: string | null
  description: string | null
  ip_address: string | null
  table_count: number
  flow_count: number
  connector_count: number
  snapshot?: InventorySnapshot
  connectors: InventoryConnector[]
}

export interface InventoryNodesResponse {
  count: number
  nodes: InventoryNode[]
}

export interface FlowAction {
  order: number
  'output-action'?: {
    'output-node-connector'?: string
    'max-length'?: number
  }
}

export interface FlowInstruction {
  order: number
  'apply-actions'?: {
    action?: FlowAction[]
  }
}

export interface FlowStatistics {
  'packet-count'?: string
  'byte-count'?: string
  duration?: {
    second?: number
    nanosecond?: number
  }
}

export interface FlowTableFlow {
  flow_id: string
  table_id: number
  priority: number
  cookie?: string
  idle_timeout?: number
  hard_timeout?: number
  match?: Record<string, unknown>
  instructions?: {
    instruction?: FlowInstruction[]
  }
  statistics?: FlowStatistics
}

export interface FlowTable {
  table_id: number
  active_flows: number
  packets_looked_up?: number
  packets_matched?: number
  flows?: FlowTableFlow[]
}

export interface FlowResponse {
  node_id: string
  table_count: number
  flow_count: number
  tables: FlowTable[]
}

export interface OvsLiveFlow {
  flow_type: 'base' | 'policy' | 'unknown'
  label: string
  cookie: string
  priority: number
  match?: string
  actions: string
  raw?: string
}

export interface OvsLiveFlowsResponse {
  bridge: string
  protocol: string
  flow_count: number
  flows: OvsLiveFlow[]
  raw_flows?: string
}
