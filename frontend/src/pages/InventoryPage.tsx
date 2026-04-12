import { useState } from 'react'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { sdnApi } from '../services/api/sdnApi'
import {
  formatBytePair,
  formatConnectorState,
  formatDateTime,
  formatNumber,
  formatPacketPair,
  formatValue,
} from '../utils/formatters'

type InventoryNodeFilter = 'all' | 'flows' | 'connectors'

export function InventoryPage() {
  const [nodeFilter, setNodeFilter] = useState<InventoryNodeFilter>('all')
  const [nodeSearch, setNodeSearch] = useState('')

  const { data, error, isLoading, reload } = useApiResource(
    sdnApi.getInventoryNodes,
    [],
  )

  const connectorCount =
    data?.nodes.reduce((total, node) => total + node.connector_count, 0) ?? 0
  const tableCount =
    data?.nodes.reduce((total, node) => total + node.table_count, 0) ?? 0
  const flowCount =
    data?.nodes.reduce((total, node) => total + node.flow_count, 0) ?? 0
  const normalizedNodeSearch = nodeSearch.trim().toLowerCase()
  const filteredNodes =
    data?.nodes.filter((node) => {
      if (nodeFilter === 'flows' && node.flow_count <= 0) {
        return false
      }

      if (nodeFilter === 'connectors' && node.connector_count <= 0) {
        return false
      }

      if (!normalizedNodeSearch) {
        return true
      }

      const connectorText = node.connectors
        .map((connector) => `${connector.connector_id} ${connector.name ?? ''}`)
        .join(' ')
      const searchableText = [
        node.node_id,
        node.description ?? '',
        node.ip_address ?? '',
        node.manufacturer ?? '',
        node.hardware ?? '',
        node.software ?? '',
        node.snapshot?.start?.begin ?? '',
        node.snapshot?.end?.end ?? '',
        connectorText,
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedNodeSearch)
    }) ?? []
  const isInventoryFilterActive =
    nodeFilter !== 'all' || normalizedNodeSearch.length > 0

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Controller inventory</h2>
          <p className="section-copy">
            This page exposes the OpenFlow node inventory already made available by
            the backend, including connector state and port counters.
          </p>
        </div>

        <button className="button" type="button" onClick={reload} disabled={isLoading}>
          Refresh inventory
        </button>
      </section>

      {isLoading && !data ? (
        <LoadingState label="Loading OpenFlow inventory and connector statistics..." />
      ) : null}

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          {error ? (
            <div className="notice notice--warning">
              Showing previously loaded inventory data. Latest refresh failed: {error}
            </div>
          ) : null}

          <div className="mini-stats">
            <div className="mini-stat">
              <span>Managed nodes</span>
              <strong>{formatNumber(data.count)}</strong>
            </div>
            <div className="mini-stat">
              <span>Total connectors</span>
              <strong>{formatNumber(connectorCount)}</strong>
            </div>
            <div className="mini-stat">
              <span>Total flows</span>
              <strong>{formatNumber(flowCount)}</strong>
            </div>
            <div className="mini-stat">
              <span>Total tables</span>
              <strong>{formatNumber(tableCount)}</strong>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard
              label="Inventory Nodes"
              value={formatNumber(data.count)}
              helper="OpenFlow nodes exposed by inventory service"
              tone="accent"
            />
            <StatCard
              label="Connectors"
              value={formatNumber(connectorCount)}
              helper="Node connectors currently visible"
            />
            <StatCard
              label="Tables"
              value={formatNumber(tableCount)}
              helper="Exposed OpenFlow table count"
            />
            <StatCard
              label="Flows"
              value={formatNumber(flowCount)}
              helper="Installed flows across managed nodes"
              tone="success"
            />
          </div>

          <Panel
            title="Inventory focus"
            description="Filter managed nodes by flow presence, connector exposure, or identifier search."
          >
            <div className="form-actions" style={{ alignItems: 'center' }}>
              <button
                className={nodeFilter === 'all' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setNodeFilter('all')}
              >
                All nodes
              </button>
              <button
                className={nodeFilter === 'flows' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setNodeFilter('flows')}
              >
                Nodes with flows
              </button>
              <button
                className={
                  nodeFilter === 'connectors' ? 'button' : 'button button--secondary'
                }
                type="button"
                onClick={() => setNodeFilter('connectors')}
              >
                Nodes with connectors
              </button>
              <input
                className="input-field"
                type="search"
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder="Search node, connector, snapshot"
                style={{ minWidth: '240px', maxWidth: '320px' }}
              />
            </div>

            {isInventoryFilterActive ? (
              <p className="section-copy" style={{ marginTop: '16px' }}>
                Showing {formatNumber(filteredNodes.length)} of{' '}
                {formatNumber(data.nodes.length)} inventory nodes
              </p>
            ) : null}
          </Panel>

          {data.nodes.length === 0 ? (
            <EmptyState
              title="No inventory nodes discovered"
              description="The backend returned an empty inventory list."
            />
          ) : null}

          {data.nodes.length > 0 && filteredNodes.length === 0 ? (
            <EmptyState
              title="No matching inventory nodes"
              description="Try switching to All nodes or clearing the search query."
            />
          ) : null}

          {filteredNodes.map((node) => {
            const wrapperStyle =
              node.flow_count > 0
                ? {
                    borderRadius: '24px',
                    boxShadow:
                      '0 0 0 1px color-mix(in srgb, var(--status-success) 24%, transparent)',
                  }
                : node.connector_count === 0
                  ? {
                      opacity: 0.82,
                    }
                  : undefined

            const nodeStatus =
              node.flow_count > 0
                ? { label: 'Flow active', tone: 'success' as const }
                : node.connector_count === 0
                  ? { label: 'No connectors', tone: 'neutral' as const }
                  : node.snapshot?.end?.succeeded
                    ? { label: 'Observed', tone: 'warning' as const }
                    : { label: 'Snapshot pending', tone: 'warning' as const }

            return (
              <div key={node.node_id} style={wrapperStyle}>
                <Panel
                  title={node.node_id}
                  description="Inventory metadata, snapshot state, flow capacity, and connector-level counters."
                  action={
                    <StatusBadge label={nodeStatus.label} tone={nodeStatus.tone} />
                  }
                >
                  <div className="mini-stats">
                    <div className="mini-stat">
                      <span>Connectors</span>
                      <strong>{formatNumber(node.connector_count)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Flows</span>
                      <strong>{formatNumber(node.flow_count)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Tables</span>
                      <strong>{formatNumber(node.table_count)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Snapshot</span>
                      <strong>{formatDateTime(node.snapshot?.end?.end)}</strong>
                    </div>
                  </div>

                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <span className="metadata-label">Manufacturer</span>
                      <strong className="metadata-value">
                        {formatValue(node.manufacturer)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Hardware</span>
                      <strong className="metadata-value">{formatValue(node.hardware)}</strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Software</span>
                      <strong className="metadata-value">{formatValue(node.software)}</strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">IP address</span>
                      <strong className="metadata-value">{formatValue(node.ip_address)}</strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Description</span>
                      <strong className="metadata-value">
                        {formatValue(node.description)}
                      </strong>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Snapshot end</span>
                      <strong className="metadata-value">
                        {formatDateTime(node.snapshot?.end?.end)}
                      </strong>
                    </div>
                  </div>

                  <div className="subsection-header">
                    <div>
                      <h4>Connectors</h4>
                      <p>Port state, addressing, and counters for this OpenFlow node.</p>
                    </div>
                    <span className="subsection-metric">
                      {formatNumber(node.connector_count)} connectors
                    </span>
                  </div>

                  {node.connectors.length === 0 ? (
                    <EmptyState
                      title="No connectors returned"
                      description="The backend did not return connector details for this node."
                    />
                  ) : (
                    <div className="table-shell">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Connector</th>
                            <th>Name / port</th>
                            <th>State</th>
                            <th>Configuration</th>
                            <th>Packets</th>
                            <th>Bytes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {node.connectors.map((connector) => (
                            <tr key={connector.connector_id}>
                              <td>
                                <div className="cell-stack">
                                  <strong className="mono">{connector.connector_id}</strong>
                                  <span className="cell-muted mono">
                                    {connector.hardware_address ?? 'No MAC'}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <div className="cell-stack">
                                  <strong>{connector.name ?? 'Unnamed port'}</strong>
                                  <span className="cell-muted">
                                    Port {formatValue(connector.port_number)}
                                  </span>
                                </div>
                              </td>
                              <td>{formatConnectorState(connector.state)}</td>
                              <td>{connector.configuration || 'Default'}</td>
                              <td>
                                {formatPacketPair(
                                  connector.statistics?.packets?.received,
                                  connector.statistics?.packets?.transmitted,
                                )}
                              </td>
                              <td>
                                {formatBytePair(
                                  connector.statistics?.bytes?.received,
                                  connector.statistics?.bytes?.transmitted,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>
            )
          })}
        </>
      ) : null}
    </div>
  )
}
