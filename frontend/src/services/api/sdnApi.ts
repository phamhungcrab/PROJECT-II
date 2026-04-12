import type {
  FlowResponse,
  HealthResponse,
  InventoryNodesResponse,
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
  getFlows: (nodeId: string) =>
    apiRequest<FlowResponse>(`/api/flows/${encodeURIComponent(nodeId)}`),
}
