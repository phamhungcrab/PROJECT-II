import type {
  FlowResponse,
  HealthResponse,
  InventoryNodesResponse,
  OvsLiveFlowsResponse,
  TopologyRawResponse,
  TopologySummaryResponse,
} from '../../types/sdn'
import { apiRequest } from './client'

export const sdnApi = {
  getHealth: () => apiRequest<HealthResponse>('/api/health'),
  getTopologyRaw: () => apiRequest<TopologyRawResponse>('/api/topology/raw'),
  getTopologySummary: () =>
    apiRequest<TopologySummaryResponse>('/api/topology/summary'),
  getInventoryNodes: () =>
    apiRequest<InventoryNodesResponse>('/api/inventory/nodes'),
  getOvsFlows: () => apiRequest<OvsLiveFlowsResponse>('/api/flows/ovs'),
  getFlows: (nodeId: string) =>
    apiRequest<FlowResponse>(`/api/flows/${encodeURIComponent(nodeId)}`),
}
