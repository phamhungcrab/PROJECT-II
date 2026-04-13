import { useState } from 'react'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { appConfig } from '../config/appConfig'
import { sdnApi } from '../services/api/sdnApi'
import {
  formatDuration,
  formatNumber,
  summarizeRecord,
} from '../utils/formatters'
import type { FlowTableFlow } from '../types/sdn'

interface OvsLiveFlow {
  flow_type: 'base' | 'policy' | 'unknown'
  label: string
  cookie: string
  priority: number
  match: string
  actions: string
  raw: string
}

interface OvsLiveFlowsResponse {
  bridge: string
  protocol: string
  flow_count: number
  flows: OvsLiveFlow[]
  raw_flows: string
}

type OvsFlowFilter = 'all' | 'base' | 'policy'

function summarizeActions(flow: FlowTableFlow) {
  const actions =
    flow.instructions?.instruction?.flatMap(
      (instruction) => instruction['apply-actions']?.action ?? [],
    ) ?? []

  if (actions.length === 0) {
    return 'No apply-actions returned'
  }

  return actions
    .map((action) => {
      const output = action['output-action']?.['output-node-connector']
      return output ? `Output ${output}` : `Action ${action.order}`
    })
    .join(' · ')
}

export function FlowsPage() {
  const [nodeIdInput, setNodeIdInput] = useState<string>(
    appConfig.defaultFlowNodeId,
  )
  const [activeNodeId, setActiveNodeId] = useState<string>(
    appConfig.defaultFlowNodeId,
  )
  const [ovsFlowFilter, setOvsFlowFilter] = useState<OvsFlowFilter>('all')
  const [ovsFlowSearch, setOvsFlowSearch] = useState<string>('')

  const inventoryQuery = useApiResource(sdnApi.getInventoryNodes, [])
  const flowQuery = useApiResource(() => sdnApi.getFlows(activeNodeId), [activeNodeId])
  const ovsFlowQuery = useApiResource<OvsLiveFlowsResponse>(async () => {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/flows/ovs`, {
      headers: {
        Accept: 'application/json',
      },
    })

    const contentType = response.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')
    const payload: unknown = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      const detail =
        payload && typeof payload === 'object' && 'detail' in payload
          ? String(payload.detail)
          : typeof payload === 'string'
            ? payload
            : `Request failed with status ${response.status}`

      throw new Error(detail)
    }

    return payload as OvsLiveFlowsResponse
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextNodeId = nodeIdInput.trim() || appConfig.defaultFlowNodeId
    setNodeIdInput(nextNodeId)
    setActiveNodeId(nextNodeId)
  }

  const handleReset = () => {
    setNodeIdInput(appConfig.defaultFlowNodeId)
    setActiveNodeId(appConfig.defaultFlowNodeId)
  }

  const ovsBaseFlowCount =
    ovsFlowQuery.data?.flows.filter((flow) => flow.flow_type === 'base').length ?? 0
  const ovsPolicyFlowCount =
    ovsFlowQuery.data?.flows.filter((flow) => flow.flow_type === 'policy').length ?? 0
  const ovsUnknownFlowCount =
    ovsFlowQuery.data?.flows.filter((flow) => flow.flow_type === 'unknown').length ?? 0
  const normalizedOvsFlowSearch = ovsFlowSearch.trim().toLowerCase()
  const filteredOvsFlows =
    ovsFlowQuery.data?.flows.filter((flow) => {
      if (ovsFlowFilter !== 'all' && flow.flow_type !== ovsFlowFilter) {
        return false
      }

      if (!normalizedOvsFlowSearch) {
        return true
      }

      const searchableText = [flow.label, flow.cookie, flow.actions]
        .join(' ')
        .toLowerCase()

      return searchableText.includes(normalizedOvsFlowSearch)
    }) ?? []
  const isOvsFilterActive =
    ovsFlowFilter !== 'all' || normalizedOvsFlowSearch.length > 0

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <h2 className="section-title">Flow tables</h2>
          <p className="section-copy">
            Query a specific node ID and inspect the flow tables exposed by the
            backend. Suggestions are loaded from the controller inventory.
          </p>
        </div>
      </section>

      <Panel
        title="Flow query"
        description="Enter a node ID manually or use inventory suggestions. The default target is openflow:1."
      >
        <form className="query-form" onSubmit={handleSubmit}>
          <label className="field-group">
            <span>Node ID</span>
            <input
              className="input-field mono"
              list="inventory-node-options"
              value={nodeIdInput}
              onChange={(event) => setNodeIdInput(event.target.value)}
              placeholder={appConfig.defaultFlowNodeId}
            />
          </label>

          <datalist id="inventory-node-options">
            {(inventoryQuery.data?.nodes ?? []).map((node) => (
              <option key={node.node_id} value={node.node_id} />
            ))}
          </datalist>

          <div className="form-actions">
            <button className="button" type="submit" disabled={flowQuery.isLoading}>
              Load flows
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={handleReset}
            >
              Reset to default
            </button>
            <button
              className="button button--ghost"
              type="button"
              onClick={flowQuery.reload}
              disabled={flowQuery.isLoading}
            >
              Refresh active node
            </button>
          </div>
        </form>

        {inventoryQuery.error ? (
          <div className="notice notice--warning">
            Inventory suggestions are unavailable: {inventoryQuery.error}
          </div>
        ) : null}
      </Panel>

      {flowQuery.isLoading && !flowQuery.data ? (
        <LoadingState
          label={`Loading flow tables for ${activeNodeId}...`}
          hint="Reading controller-reported tables, flow entries, and counters for the selected node."
          variant="table"
        />
      ) : null}

      {flowQuery.error && !flowQuery.data ? (
        <ErrorState
          title="Flow table query failed"
          message={flowQuery.error}
          onRetry={flowQuery.reload}
        />
      ) : null}

      <Panel
        title="OVS Live Flows"
        description="Direct live flow dump from Open vSwitch on bridge s1."
        action={
          <button
            className="button button--ghost"
            type="button"
            onClick={ovsFlowQuery.reload}
            disabled={ovsFlowQuery.isLoading}
          >
            Refresh OVS flows
          </button>
        }
      >
        {ovsFlowQuery.isLoading && !ovsFlowQuery.data ? (
          <LoadingState
            label="Loading OVS live flows..."
            hint="Collecting the current switch-side flow dump from bridge s1."
            variant="table"
          />
        ) : null}

        {ovsFlowQuery.error && !ovsFlowQuery.data ? (
          <ErrorState
            title="OVS live flows unavailable"
            message={ovsFlowQuery.error}
            onRetry={ovsFlowQuery.reload}
          />
        ) : null}

        {ovsFlowQuery.data ? (
          <>
            {ovsFlowQuery.error ? (
              <div className="notice notice--warning">
                Showing previously loaded OVS flow data. Latest refresh failed:{' '}
                {ovsFlowQuery.error}
              </div>
            ) : null}

            <div className="mini-stats">
              <div className="mini-stat">
                <span>Bridge</span>
                <strong className="mono">{ovsFlowQuery.data.bridge}</strong>
              </div>
              <div className="mini-stat">
                <span>Protocol</span>
                <strong>{ovsFlowQuery.data.protocol}</strong>
              </div>
              <div className="mini-stat">
                <span>Flow count</span>
                <strong>{formatNumber(ovsFlowQuery.data.flow_count)}</strong>
              </div>
            </div>

            <p className="section-copy" style={{ marginTop: '16px' }}>
              Base flows: {formatNumber(ovsBaseFlowCount)} · Policy flows:{' '}
              {formatNumber(ovsPolicyFlowCount)} · Unknown flows:{' '}
              {formatNumber(ovsUnknownFlowCount)}
            </p>

            <div
              className="form-actions"
              style={{ marginTop: '16px', alignItems: 'center' }}
            >
              <button
                className={ovsFlowFilter === 'all' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setOvsFlowFilter('all')}
              >
                Show all
              </button>
              <button
                className={ovsFlowFilter === 'base' ? 'button' : 'button button--secondary'}
                type="button"
                onClick={() => setOvsFlowFilter('base')}
              >
                Base only
              </button>
              <button
                className={
                  ovsFlowFilter === 'policy' ? 'button' : 'button button--secondary'
                }
                type="button"
                onClick={() => setOvsFlowFilter('policy')}
              >
                Policy only
              </button>
              <input
                className="input-field"
                type="search"
                value={ovsFlowSearch}
                onChange={(event) => setOvsFlowSearch(event.target.value)}
                placeholder="Search label, cookie, actions"
                style={{ minWidth: '240px', maxWidth: '320px' }}
              />
            </div>

            {isOvsFilterActive ? (
              <p className="section-copy" style={{ marginTop: '12px' }}>
                Showing {formatNumber(filteredOvsFlows.length)} of{' '}
                {formatNumber(ovsFlowQuery.data.flows.length)} OVS flows
              </p>
            ) : null}

            {ovsFlowQuery.data.flows.length === 0 ? (
              <EmptyState
                title="No OVS flows returned"
                description="The OVS dump did not return any flow entries."
                eyebrow="Live evidence"
              />
            ) : filteredOvsFlows.length === 0 ? (
              <EmptyState
                title="No matching OVS flows"
                description="Try switching to All or clearing the search query."
                eyebrow="Filter result"
              />
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Type</th>
                      <th>Cookie</th>
                      <th>Priority</th>
                      <th>Actions</th>
                      <th>Raw</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOvsFlows.map((flow, index) => (
                      <tr
                        key={`${flow.cookie}-${index}`}
                        style={
                          flow.flow_type === 'policy'
                            ? {
                                background:
                                  'color-mix(in srgb, var(--status-warning) 8%, transparent)',
                              }
                            : undefined
                        }
                      >
                        <td>{flow.label || 'Unclassified'}</td>
                        <td>
                          <StatusBadge
                            label={
                              flow.flow_type === 'base'
                                ? 'Base'
                                : flow.flow_type === 'policy'
                                  ? 'Policy'
                                  : 'Unknown'
                            }
                            tone={
                              flow.flow_type === 'base'
                                ? 'success'
                                : flow.flow_type === 'policy'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          />
                        </td>
                        <td className="mono">{flow.cookie}</td>
                        <td>{formatNumber(flow.priority)}</td>
                        <td>{flow.actions || 'N/A'}</td>
                        <td className="mono">{flow.raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}
      </Panel>

      {flowQuery.data ? (
        <>
          {flowQuery.error ? (
            <div className="notice notice--warning">
              Showing previously loaded flow data. Latest refresh failed: {flowQuery.error}
            </div>
          ) : null}

          <div className="stats-grid">
            <StatCard
              label="Active Node"
              value={<span className="mono">{flowQuery.data.node_id}</span>}
              helper="Current flow query target"
              tone="accent"
            />
            <StatCard
              label="Table Capacity"
              value={formatNumber(flowQuery.data.table_count)}
              helper="Reported table count for the node"
            />
            <StatCard
              label="Active Tables"
              value={formatNumber(flowQuery.data.tables.length)}
              helper="Tables returned with flow data"
            />
            <StatCard
              label="Flows"
              value={formatNumber(flowQuery.data.flow_count)}
              helper="Total flows reported by backend"
              tone="success"
            />
          </div>

          {flowQuery.data.tables.length === 0 ? (
            <EmptyState
              title="No active tables returned"
              description="The backend returned zero tables with flow content for this node."
              eyebrow="Controller view"
            />
          ) : null}

          {flowQuery.data.tables.map((table) => (
            <Panel
              key={table.table_id}
              title={`Table ${table.table_id}`}
              description="Flow definitions, match rules, actions, and counters for the selected table."
            >
              <div className="mini-stats">
                <div className="mini-stat">
                  <span>Active flows</span>
                  <strong>{formatNumber(table.active_flows)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Packets looked up</span>
                  <strong>{formatNumber(table.packets_looked_up)}</strong>
                </div>
                <div className="mini-stat">
                  <span>Packets matched</span>
                  <strong>{formatNumber(table.packets_matched)}</strong>
                </div>
              </div>

              {table.flows?.length ? (
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Flow</th>
                        <th>Priority / cookie</th>
                        <th>Match</th>
                        <th>Actions</th>
                        <th>Counters</th>
                        <th>Timeouts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.flows.map((flow) => (
                        <tr key={flow.flow_id}>
                          <td>
                            <div className="cell-stack">
                              <strong className="mono">{flow.flow_id}</strong>
                              <span className="cell-muted">Table {flow.table_id}</span>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <strong>{formatNumber(flow.priority)}</strong>
                              <span className="cell-muted mono">
                                {flow.cookie ?? 'No cookie'}
                              </span>
                            </div>
                          </td>
                          <td>{summarizeRecord(flow.match)}</td>
                          <td>{summarizeActions(flow)}</td>
                          <td>
                            <div className="cell-stack">
                              <span>
                                Packets {formatNumber(flow.statistics?.['packet-count'])}
                              </span>
                              <span>
                                Bytes {formatNumber(flow.statistics?.['byte-count'])}
                              </span>
                              <span className="cell-muted">
                                Duration{' '}
                                {formatDuration(
                                  flow.statistics?.duration?.second,
                                  flow.statistics?.duration?.nanosecond,
                                )}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="cell-stack">
                              <span>Idle {formatNumber(flow.idle_timeout)}</span>
                              <span>Hard {formatNumber(flow.hard_timeout)}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No flows in this table"
                  description="The backend returned the table without specific flow entries."
                  eyebrow="Table detail"
                />
              )}
            </Panel>
          ))}
        </>
      ) : null}
    </div>
  )
}
