import { useState } from 'react'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { sdnApi } from '../services/api/sdnApi'
import { classifyNode, formatNumber } from '../utils/formatters'

interface TopologyViewData {
  summary: Awaited<ReturnType<typeof sdnApi.getTopologySummary>>
  raw: Awaited<ReturnType<typeof sdnApi.getTopologyRaw>>
}

type TopologyNodeFilter = 'all' | 'switches' | 'hosts'

function getTopologyNodeType(nodeId: string) {
  const classifiedType = classifyNode(nodeId)
  return classifiedType === 'Node' ? 'Other' : classifiedType
}

function getTopologyNodeTone(nodeType: string) {
  if (nodeType === 'Switch') {
    return 'success' as const
  }

  if (nodeType === 'Host') {
    return 'warning' as const
  }

  return 'neutral' as const
}

export function TopologyPage() {
  const [nodeFilter, setNodeFilter] = useState<TopologyNodeFilter>('all')
  const [nodeSearch, setNodeSearch] = useState('')

  const { data, error, isLoading, reload } = useApiResource<TopologyViewData>(
    async () => {
      const [summary, raw] = await Promise.all([
        sdnApi.getTopologySummary(),
        sdnApi.getTopologyRaw(),
      ])

      return { summary, raw }
    },
    [],
  )

  const rawTopology = data?.raw['network-topology:topology']?.[0] ?? null
  const rawNodeMap = new Map(
    (rawTopology?.node ?? []).map((node) => [node['node-id'], node]),
  )
  const normalizedNodeSearch = nodeSearch.trim().toLowerCase()
  const filteredTopologyNodes =
    data?.summary.nodes.filter((node) => {
      const rawNode = rawNodeMap.get(node.node_id)
      const nodeType = getTopologyNodeType(node.node_id)
      const inventoryRef =
        rawNode?.['opendaylight-topology-inventory:inventory-node-ref'] ??
        node.inventory_ref ??
        ''
      const attachmentText = (rawNode?.['host-tracker-service:attachment-points'] ?? [])
        .map((attachment) => attachment['tp-id'])
        .join(' ')
      const terminationPointText = (rawNode?.['termination-point'] ?? [])
        .map((terminationPoint) => terminationPoint['tp-id'])
        .join(' ')
      const addressText = (rawNode?.['host-tracker-service:addresses'] ?? [])
        .map((address) => `${address.ip ?? ''} ${address.mac ?? ''}`)
        .join(' ')

      if (nodeFilter === 'switches' && nodeType !== 'Switch') {
        return false
      }

      if (nodeFilter === 'hosts' && nodeType !== 'Host') {
        return false
      }

      if (!normalizedNodeSearch) {
        return true
      }

      const searchableText = [
        node.node_id,
        inventoryRef,
        attachmentText,
        terminationPointText,
        addressText,
      ]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedNodeSearch)
    }) ?? []
  const isTopologyFilterActive =
    nodeFilter !== 'all' || normalizedNodeSearch.length > 0

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Topology composition</h2>
          <p className="section-copy">
            Summary counters from the backend are paired here with raw OpenDaylight
            topology context so nodes, hosts, and links remain traceable.
          </p>
        </div>

        <button className="button" type="button" onClick={reload} disabled={isLoading}>
          Refresh topology
        </button>
      </section>

      {isLoading && !data ? (
        <LoadingState label="Loading topology summary and raw topology data..." />
      ) : null}

      {error && !data ? <ErrorState message={error} onRetry={reload} /> : null}

      {data ? (
        <>
          {error ? (
            <div className="notice notice--warning">
              Showing previously loaded topology data. Latest refresh failed: {error}
            </div>
          ) : null}

          <div className="mini-stats">
            <div className="mini-stat">
              <span>Total nodes</span>
              <strong>{formatNumber(data.summary.node_count)}</strong>
            </div>
            <div className="mini-stat">
              <span>Switches</span>
              <strong>{formatNumber(data.summary.switch_count)}</strong>
            </div>
            <div className="mini-stat">
              <span>Hosts</span>
              <strong>{formatNumber(data.summary.host_count)}</strong>
            </div>
            <div className="mini-stat">
              <span>Links</span>
              <strong>{formatNumber(data.summary.link_count)}</strong>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard
              label="Topology ID"
              value={<span className="mono">{data.summary.topology_id}</span>}
              helper="Controller topology namespace"
              tone="accent"
            />
            <StatCard
              label="Nodes"
              value={formatNumber(data.summary.node_count)}
              helper={`${formatNumber(data.summary.switch_count)} switches / ${formatNumber(
                data.summary.host_count,
              )} hosts`}
            />
            <StatCard
              label="Links"
              value={formatNumber(data.summary.link_count)}
              helper="Directed links returned by topology service"
            />
            <StatCard
              label="Termination Points"
              value={formatNumber(data.summary.termination_point_count)}
              helper="Edge attachment and switch connector count"
            />
            <StatCard
              label="Raw Objects"
              value={formatNumber((rawTopology?.node?.length ?? 0) + (rawTopology?.link?.length ?? 0))}
              helper={`${formatNumber(rawTopology?.node?.length ?? 0)} nodes / ${formatNumber(
                rawTopology?.link?.length ?? 0,
              )} links`}
            />
          </div>

          <Panel
            title="Topology nodes"
            description="Filterable operator view of nodes, roles, attachment points, and controller inventory references."
          >
            <div className="form-actions" style={{ alignItems: 'center' }}>
              <button
                className={nodeFilter === 'all' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setNodeFilter('all')}
              >
                All
              </button>
              <button
                className={nodeFilter === 'switches' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setNodeFilter('switches')}
              >
                Switches
              </button>
              <button
                className={nodeFilter === 'hosts' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setNodeFilter('hosts')}
              >
                Hosts
              </button>
              <input
                className="input-field"
                type="search"
                value={nodeSearch}
                onChange={(event) => setNodeSearch(event.target.value)}
                placeholder="Search node, inventory ref, termination point"
                style={{ minWidth: '240px', maxWidth: '320px' }}
              />
            </div>

            {isTopologyFilterActive ? (
              <p className="section-copy" style={{ marginTop: '16px' }}>
                Showing {formatNumber(filteredTopologyNodes.length)} of{' '}
                {formatNumber(data.summary.nodes.length)} topology nodes
              </p>
            ) : null}

            {filteredTopologyNodes.length === 0 ? (
              <EmptyState
                title="No matching topology nodes"
                description="Try switching to All or clearing the search query."
              />
            ) : (
              <ul className="entity-list">
                {filteredTopologyNodes.map((node) => {
                  const rawNode = rawNodeMap.get(node.node_id)
                  const addresses = rawNode?.['host-tracker-service:addresses'] ?? []
                  const attachments =
                    rawNode?.['host-tracker-service:attachment-points'] ?? []
                  const terminationPoints = rawNode?.['termination-point'] ?? []
                  const inventoryRef =
                    rawNode?.['opendaylight-topology-inventory:inventory-node-ref'] ??
                    node.inventory_ref
                  const nodeType = getTopologyNodeType(node.node_id)

                  return (
                    <li key={node.node_id} className="entity-list-item">
                      <div style={{ minWidth: 0 }}>
                        <div className="entity-list-heading">
                          <span className="mono">{node.node_id}</span>
                          <StatusBadge
                            label={nodeType}
                            tone={getTopologyNodeTone(nodeType)}
                          />
                        </div>
                        <p className="entity-list-meta">
                          {formatNumber(node.termination_point_count)} termination points
                        </p>
                        <p className="entity-list-meta mono">
                          {inventoryRef ?? 'No inventory reference'}
                        </p>
                        {addresses.length > 0 ? (
                          <div className="chip-row">
                            {addresses.map((address) => (
                              <span key={address.id} className="chip">
                                {address.ip ?? address.mac ?? 'Address'}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {attachments.length > 0 ? (
                          <div className="chip-row">
                            {attachments.map((attachment) => (
                              <span key={attachment['tp-id']} className="chip">
                                {attachment['tp-id']}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="cell-stack" style={{ textAlign: 'right' }}>
                        <span>Attachments {formatNumber(attachments.length)}</span>
                        <span>TPs {formatNumber(terminationPoints.length)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          <Panel
            title="Topology links"
            description="Readable source and destination path pairs derived from the topology summary endpoint."
          >
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Link ID</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Path</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.links.map((link) => (
                    <tr key={link.link_id}>
                      <td className="mono">{link.link_id}</td>
                      <td>
                        <div className="cell-stack">
                          <strong className="mono">{link.source_node}</strong>
                          <span className="cell-muted mono">{link.source_tp}</span>
                        </div>
                      </td>
                      <td>
                        <div className="cell-stack">
                          <strong className="mono">{link.destination_node}</strong>
                          <span className="cell-muted mono">{link.destination_tp}</span>
                        </div>
                      </td>
                      <td className="mono">
                        {link.source_tp} → {link.destination_tp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
    </div>
  )
}
