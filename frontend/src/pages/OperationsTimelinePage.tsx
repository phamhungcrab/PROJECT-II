import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDefenseMode } from '../app/defenseMode'
import { EmptyState } from '../components/state/EmptyState'
import { ErrorState } from '../components/state/ErrorState'
import { LoadingState } from '../components/state/LoadingState'
import { Panel } from '../components/ui/Panel'
import { StatCard } from '../components/ui/StatCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useApiResource } from '../hooks/useApiResource'
import { policyApi } from '../services/api/policyApi'
import { sdnApi } from '../services/api/sdnApi'
import type { AlertRecord } from '../types/alerts'
import type {
  DemoPolicyStatusResponse,
  PolicyDriftSummaryResponse,
  PolicyEventsResponse,
  PolicySummaryResponse,
} from '../types/policy'
import type {
  HealthResponse,
  InventoryNodesResponse,
  OvsLiveFlowsResponse,
} from '../types/sdn'
import { buildOperationalAlerts, summarizeAlerts } from '../utils/alertCenter'
import { formatDateTime, formatLabel, formatNumber } from '../utils/formatters'
import {
  buildOperationsTimeline,
  getOperationsTimelineCategoryLabel,
  getOperationsTimelineImportanceTone,
  type OperationsTimelineCategory,
  type OperationsTimelineItem,
  type PolicyHistorySnapshot,
} from '../utils/operationsTimeline'

type TimelineViewMode = 'feed' | 'policy' | 'category'
type TimelineWindow = 'all' | '24h' | '6h'
type TimelineCategoryFilter = 'all' | OperationsTimelineCategory

interface OperationsTimelineData {
  checkedAt: string
  health: HealthResponse | null
  healthError: string | null
  inventory: InventoryNodesResponse | null
  inventoryError: string | null
  policySummary: PolicySummaryResponse | null
  policySummaryError: string | null
  policyEvents: PolicyEventsResponse | null
  policyEventsError: string | null
  driftSummary: PolicyDriftSummaryResponse | null
  driftError: string | null
  demoStatus: DemoPolicyStatusResponse | null
  demoStatusError: string | null
  ovsEvidence: OvsLiveFlowsResponse | null
  ovsEvidenceError: string | null
  policyHistory: PolicyHistorySnapshot[]
}

interface GroupedTimelineSection {
  id: string
  title: string
  helper: string
  path: string | null
  items: OperationsTimelineItem[]
}

async function loadSource<T>(loader: () => Promise<T>) {
  try {
    const data = await loader()
    return {
      data,
      error: null,
    }
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unexpected data source failure.',
    }
  }
}

function getWindowHours(window: TimelineWindow) {
  if (window === '6h') {
    return 6
  }

  if (window === '24h') {
    return 24
  }

  return null
}

function isWithinWindow(item: OperationsTimelineItem, window: TimelineWindow) {
  const hours = getWindowHours(window)
  if (hours === null) {
    return true
  }

  const parsedDate = new Date(item.timestamp)
  if (Number.isNaN(parsedDate.getTime())) {
    return false
  }

  return Date.now() - parsedDate.getTime() <= hours * 60 * 60 * 1000
}

function matchesSearch(item: OperationsTimelineItem, searchTerm: string) {
  const normalizedSearch = searchTerm.trim().toLowerCase()
  if (!normalizedSearch) {
    return true
  }

  return [
    item.title,
    item.summary,
    item.related_policy_name,
    item.related_area,
    item.source,
    item.category,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch)
}

function getCategoryOptions(): Array<{
  value: TimelineCategoryFilter
  label: string
}> {
  return [
    { value: 'all', label: 'All categories' },
    { value: 'control', label: 'Control' },
    { value: 'verification', label: 'Verification' },
    { value: 'evidence', label: 'Evidence' },
    { value: 'drift', label: 'Drift' },
    { value: 'alert', label: 'Alert' },
    { value: 'recovery', label: 'Recovery' },
  ]
}

function getGroupedByPolicy(items: OperationsTimelineItem[]): GroupedTimelineSection[] {
  const groups = new Map<string, GroupedTimelineSection>()

  items.forEach((item) => {
    const key = item.related_policy_id ?? 'environment'
    const title = item.related_policy_name ?? 'Environment and cross-policy activity'
    const existingGroup = groups.get(key)

    if (existingGroup) {
      existingGroup.items.push(item)
      return
    }

    groups.set(key, {
      id: `policy-${key}`,
      title,
      helper: item.related_policy_name
        ? `Grouped replay for ${item.related_policy_name}.`
        : 'Cross-cutting timeline entries derived from current platform state.',
      path: item.related_path ?? '/policies',
      items: [item],
    })
  })

  return Array.from(groups.values()).sort(
    (left, right) =>
      new Date(right.items[0]?.timestamp ?? 0).getTime() -
      new Date(left.items[0]?.timestamp ?? 0).getTime(),
  )
}

function getGroupedByCategory(items: OperationsTimelineItem[]): GroupedTimelineSection[] {
  const categories: OperationsTimelineCategory[] = [
    'control',
    'verification',
    'evidence',
    'drift',
    'alert',
    'recovery',
  ]

  return categories
    .map((category) => {
      const categoryItems = items.filter((item) => item.category === category)
      if (categoryItems.length === 0) {
        return null
      }

      const latestItem = categoryItems[0]
      return {
        id: `category-${category}`,
        title: `${getOperationsTimelineCategoryLabel(category)} activity`,
        helper:
          category === 'alert'
            ? 'Derived current alert signals that affect operator readiness.'
            : category === 'drift'
              ? 'Recorded or derived drift conditions from the current compliance snapshot.'
              : `Chronological replay of ${getOperationsTimelineCategoryLabel(
                  category,
                ).toLowerCase()} activity.`,
        path: latestItem?.related_path ?? null,
        items: categoryItems,
      }
    })
    .filter((group): group is GroupedTimelineSection => group !== null)
}

function getRouteForArea(area: string) {
  if (area === 'Policy Center') {
    return '/policies'
  }

  if (area === 'Flows') {
    return '/flows'
  }

  if (area === 'Alert Center') {
    return '/alert-center'
  }

  if (area === 'Metrics Center') {
    return '/metrics-center'
  }

  if (area === 'Demo Assistant') {
    return '/demo-assistant'
  }

  return null
}

function TimelineFeedItem({ item }: { item: OperationsTimelineItem }) {
  const categoryLabel = getOperationsTimelineCategoryLabel(item.category)
  const details = item.details ?? []
  const relatedLabel = item.related_policy_name ?? item.related_area

  return (
    <article className="timeline-entry">
      <div
        className={`timeline-marker timeline-marker--${item.importance}`}
        aria-hidden="true"
      />
      <div className="timeline-entry-card">
        <header className="timeline-entry-header">
          <div className="timeline-entry-copy">
            <div className="timeline-entry-heading">
              <StatusBadge
                label={categoryLabel}
                tone={getOperationsTimelineImportanceTone(item.importance)}
              />
              <StatusBadge
                label={item.derived ? 'Derived timeline entry' : 'Recorded event'}
                tone={item.derived ? 'neutral' : 'success'}
              />
            </div>
            <h4 className="timeline-entry-title">{item.title}</h4>
            <p className="timeline-entry-summary">{item.summary}</p>
          </div>
          <div className="timeline-entry-time">
            <strong>{formatDateTime(item.timestamp)}</strong>
            <span>{relatedLabel}</span>
          </div>
        </header>

        <div className="chip-row" style={{ marginTop: '14px' }}>
          {item.supporting_badges.map((badge) => (
            <StatusBadge key={`${item.id}-${badge.label}`} label={badge.label} tone={badge.tone} />
          ))}
        </div>

        <div className="timeline-entry-meta">
          <span>
            Source <strong>{item.source}</strong>
          </span>
          <span>
            Area <strong>{item.related_area}</strong>
          </span>
          {item.related_policy_name ? (
            <span>
              Policy <strong>{item.related_policy_name}</strong>
            </span>
          ) : null}
        </div>

        {details.length > 0 ? (
          <ul className="timeline-detail-list">
            {details.map((detail) => (
              <li key={`${item.id}-${detail}`} className="mono">
                {detail}
              </li>
            ))}
          </ul>
        ) : null}

        {item.related_path ? (
          <div className="form-actions" style={{ marginTop: '14px' }}>
            <Link className="timeline-inline-link" to={item.related_path}>
              Open {item.related_area}
            </Link>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function GroupedTimelineView({
  groups,
}: {
  groups: GroupedTimelineSection[]
}) {
  return (
    <div className="timeline-group-grid">
      {groups.map((group) => (
        <section key={group.id} className="timeline-group-card">
          <header className="timeline-group-header">
            <div>
              <h4>{group.title}</h4>
              <p>{group.helper}</p>
            </div>
            <div className="timeline-group-meta">
              <StatusBadge
                label={`${formatNumber(group.items.length)} entr${
                  group.items.length === 1 ? 'y' : 'ies'
                }`}
                tone="neutral"
              />
              {group.path ? (
                <Link className="timeline-inline-link" to={group.path}>
                  Open context
                </Link>
              ) : null}
            </div>
          </header>

          <div className="timeline-group-list">
            {group.items.slice(0, 6).map((item) => (
              <div key={item.id} className="timeline-group-item">
                <div className="timeline-group-item-copy">
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </div>
                <div className="timeline-group-item-meta">
                  <StatusBadge
                    label={getOperationsTimelineCategoryLabel(item.category)}
                    tone={getOperationsTimelineImportanceTone(item.importance)}
                  />
                  <span>{formatDateTime(item.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function OperationsTimelinePage() {
  const { defenseMode } = useDefenseMode()
  const [viewMode, setViewMode] = useState<TimelineViewMode>('feed')
  const [windowFilter, setWindowFilter] = useState<TimelineWindow>('24h')
  const [categoryFilter, setCategoryFilter] = useState<TimelineCategoryFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const { data, error, isLoading, reload } = useApiResource<OperationsTimelineData>(
    async () => {
      const [
        health,
        inventory,
        policySummary,
        policyEvents,
        driftSummary,
        demoStatus,
        ovsEvidence,
      ] = await Promise.all([
        loadSource(() => sdnApi.getHealth()),
        loadSource(() => sdnApi.getInventoryNodes()),
        loadSource(() => policyApi.getSummary()),
        loadSource(() => policyApi.getEvents()),
        loadSource(() => policyApi.getDriftSummary()),
        loadSource(() => policyApi.getDemoStatus()),
        loadSource(() => sdnApi.getOvsFlows()),
      ])

      const policyHistory = policySummary.data
        ? await Promise.all(
            policySummary.data.policies.map(async (policy) => {
              const [evidence, verifications] = await Promise.all([
                loadSource(() => policyApi.getEvidence(policy.id)),
                loadSource(() => policyApi.getVerifications(policy.id)),
              ])

              return {
                policy,
                evidence: evidence.data?.evidence ?? [],
                evidenceError: evidence.error,
                verifications: verifications.data?.verifications ?? [],
                verificationError: verifications.error,
              }
            }),
          )
        : []

      return {
        checkedAt: new Date().toISOString(),
        health: health.data,
        healthError: health.error,
        inventory: inventory.data,
        inventoryError: inventory.error,
        policySummary: policySummary.data,
        policySummaryError: policySummary.error,
        policyEvents: policyEvents.data,
        policyEventsError: policyEvents.error,
        driftSummary: driftSummary.data,
        driftError: driftSummary.error,
        demoStatus: demoStatus.data,
        demoStatusError: demoStatus.error,
        ovsEvidence: ovsEvidence.data,
        ovsEvidenceError: ovsEvidence.error,
        policyHistory,
      }
    },
    [],
  )

  const alerts = useMemo<AlertRecord[]>(
    () =>
      buildOperationalAlerts({
        checkedAt: data?.checkedAt ?? new Date().toISOString(),
        health: data?.health,
        healthError: data?.healthError,
        inventory: data?.inventory,
        policySummary: data?.policySummary,
        policySummaryError: data?.policySummaryError,
        driftSummary: data?.driftSummary,
        driftError: data?.driftError,
        demoStatus: data?.demoStatus,
        demoStatusError: data?.demoStatusError,
        ovsEvidence: data?.ovsEvidence,
        ovsEvidenceError: data?.ovsEvidenceError,
      }),
    [data],
  )

  const timelineItems = useMemo(
    () =>
      buildOperationsTimeline({
        checkedAt: data?.checkedAt ?? new Date().toISOString(),
        policyEvents: data?.policyEvents?.events ?? [],
        policyHistory: data?.policyHistory ?? [],
        driftSummary: data?.driftSummary ?? null,
        alerts,
        demoStatus: data?.demoStatus ?? null,
      }),
    [alerts, data],
  )

  const filteredItems = useMemo(
    () =>
      timelineItems.filter(
        (item) =>
          isWithinWindow(item, windowFilter) &&
          (categoryFilter === 'all' || item.category === categoryFilter) &&
          matchesSearch(item, searchTerm),
      ),
    [categoryFilter, searchTerm, timelineItems, windowFilter],
  )

  const groupedByPolicy = useMemo(
    () => getGroupedByPolicy(filteredItems),
    [filteredItems],
  )
  const groupedByCategory = useMemo(
    () => getGroupedByCategory(filteredItems),
    [filteredItems],
  )

  const alertsSummary = summarizeAlerts(alerts)
  const recordedEntries = filteredItems.filter((item) => !item.derived).length
  const derivedEntries = filteredItems.filter((item) => item.derived).length
  const touchedPolicies = new Set(
    filteredItems
      .map((item) => item.related_policy_id)
      .filter((value): value is string => Boolean(value)),
  ).size
  const recentSixHourEntries = timelineItems.filter((item) => isWithinWindow(item, '6h')).length
  const evidenceBackedPolicies = (data?.policyHistory ?? []).filter(
    (history) => history.evidence.length > 0,
  ).length
  const verificationBackedPolicies = (data?.policyHistory ?? []).filter(
    (history) => history.verifications.length > 0,
  ).length
  const unavailableHistorySources = (data?.policyHistory ?? []).filter(
    (history) => history.evidenceError || history.verificationError,
  )
  const sourceWarnings = [
    data?.policySummaryError
      ? `Policy summary is currently unavailable: ${data.policySummaryError}`
      : null,
    data?.policyEventsError
      ? `Recorded event log is currently unavailable: ${data.policyEventsError}`
      : null,
    data?.driftError ? `Current drift summary is unavailable: ${data.driftError}` : null,
    data?.healthError ? `Controller health check is unavailable: ${data.healthError}` : null,
    data?.inventoryError
      ? `Inventory snapshot is unavailable: ${data.inventoryError}`
      : null,
    data?.ovsEvidenceError
      ? `OVS evidence snapshot is unavailable: ${data.ovsEvidenceError}`
      : null,
    unavailableHistorySources.length > 0
      ? `${formatNumber(
          unavailableHistorySources.length,
        )} policy histories are only partially available in the current snapshot.`
      : null,
  ].filter((value): value is string => Boolean(value))

  if (isLoading && !data) {
    return (
      <div className="page">
        <LoadingState
          label="Loading timeline, evidence, and verification history..."
          hint="Preparing the chronological audit replay for recent control activity."
          variant="workspace"
        />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="page">
        <ErrorState
          title="Operations timeline unavailable"
          message={error}
          onRetry={reload}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <section className="page-toolbar">
        <div>
          <p className="eyebrow">Read-only operational replay</p>
          <h2 className="section-title">Operations Timeline / Audit Replay</h2>
          <p className="section-copy">
            Chronological replay of recorded policy actions, observed evidence,
            verification history, and current derived drift or alert signals. This
            page explains the control story without claiming write-side NETCONF or
            external audit system support.
          </p>
        </div>

        <div className="hero-actions">
          <div className="meta-chip">
            <span>Checked</span>
            <strong>{formatDateTime(data?.checkedAt)}</strong>
          </div>
          <Link
            className="button button--ghost"
            to="/metrics-center"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            Open Metrics Center
          </Link>
          <button className="button" type="button" onClick={reload} disabled={isLoading}>
            Refresh timeline
          </button>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          label="Visible Timeline Entries"
          value={formatNumber(filteredItems.length)}
          helper={`Recent window ${windowFilter === 'all' ? 'All' : windowFilter}`}
          tone="accent"
        />
        <StatCard
          label="Recorded Entries"
          value={formatNumber(recordedEntries)}
          helper="Event log, evidence snapshots, and verification history."
          tone="success"
        />
        <StatCard
          label="Derived Entries"
          value={formatNumber(derivedEntries)}
          helper="Derived from current alerts, drift state, or baseline status."
        />
        <StatCard
          label="Policies Touched"
          value={formatNumber(touchedPolicies)}
          helper="Distinct policies referenced by the visible replay."
        />
        <StatCard
          label="Active Signals"
          value={formatNumber(alertsSummary.active_alerts + (data?.driftSummary?.drift_count ?? 0))}
          helper="Open alert signals plus current drifted policies."
        />
      </section>

      <div className="content-grid content-grid--two">
        <Panel
          title="Replay Controls"
          description="Switch between latest-first replay, policy grouping, or category grouping. Filters only affect the current view."
        >
          <div className="timeline-controls-grid">
            <label className="field-group">
              <span>Replay view</span>
              <div className="form-actions">
                <button
                  className={`button ${
                    viewMode === 'feed' ? '' : 'button--secondary'
                  }`}
                  type="button"
                  onClick={() => setViewMode('feed')}
                >
                  Latest first
                </button>
                <button
                  className={`button ${
                    viewMode === 'policy' ? '' : 'button--secondary'
                  }`}
                  type="button"
                  onClick={() => setViewMode('policy')}
                >
                  Group by policy
                </button>
                <button
                  className={`button ${
                    viewMode === 'category' ? '' : 'button--secondary'
                  }`}
                  type="button"
                  onClick={() => setViewMode('category')}
                >
                  Group by category
                </button>
              </div>
            </label>

            <label className="field-group">
              <span>Recent activity window</span>
              <div className="form-actions">
                <button
                  className={`button ${
                    windowFilter === '6h' ? '' : 'button--secondary'
                  }`}
                  type="button"
                  onClick={() => setWindowFilter('6h')}
                >
                  6 hours
                </button>
                <button
                  className={`button ${
                    windowFilter === '24h' ? '' : 'button--secondary'
                  }`}
                  type="button"
                  onClick={() => setWindowFilter('24h')}
                >
                  24 hours
                </button>
                <button
                  className={`button ${
                    windowFilter === 'all' ? '' : 'button--secondary'
                  }`}
                  type="button"
                  onClick={() => setWindowFilter('all')}
                >
                  All entries
                </button>
              </div>
            </label>

            <div className="timeline-filter-grid">
              <label className="field-group">
                <span>Category filter</span>
                <select
                  className="input-field"
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value as TimelineCategoryFilter)
                  }
                >
                  {getCategoryOptions().map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span>Search replay</span>
                <input
                  className="input-field"
                  type="search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Policy, source, title, or summary"
                />
              </label>
            </div>

            <div className="timeline-link-grid">
              {[
                { label: 'Open Policy Center', path: '/policies' },
                { label: 'Open Flows', path: '/flows' },
                { label: 'Open Alert Center', path: '/alert-center' },
                { label: 'Open Metrics Center', path: '/metrics-center' },
                { label: 'Open Demo Assistant', path: '/demo-assistant' },
              ].map((link) => (
                <Link key={link.path} className="timeline-inline-link" to={link.path}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Audit Scope"
          description="What this replay can currently explain using existing SDN product data and derived state."
        >
          <div className="mini-stats">
            <div className="mini-stat">
              <span>Event records</span>
              <strong>{formatNumber(data?.policyEvents?.count ?? 0)}</strong>
            </div>
            <div className="mini-stat">
              <span>Evidence-backed policies</span>
              <strong>{formatNumber(evidenceBackedPolicies)}</strong>
            </div>
            <div className="mini-stat">
              <span>Verification-backed policies</span>
              <strong>{formatNumber(verificationBackedPolicies)}</strong>
            </div>
            <div className="mini-stat">
              <span>Recent control activity</span>
              <strong>{formatNumber(recentSixHourEntries)}</strong>
            </div>
          </div>

          <div className="timeline-definition-list">
            <div className="timeline-definition-item">
              <strong>Recorded event</strong>
              <p>Directly loaded from policy events, evidence snapshots, or verification history.</p>
            </div>
            <div className="timeline-definition-item">
              <strong>Derived timeline entry</strong>
              <p>Computed from current alert synthesis, drift summary, or current demo policy status.</p>
            </div>
            <div className="timeline-definition-item">
              <strong>Recovery relevance</strong>
              <p>Highlights when baseline restore or rollback still matters in the current snapshot.</p>
            </div>
          </div>

          {sourceWarnings.length > 0 ? (
            <div className="notice notice--warning" style={{ marginTop: '18px' }}>
              <strong>Partial source coverage</strong>
              <ul className="timeline-warning-list">
                {sourceWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="chip-row" style={{ marginTop: '18px' }}>
              <StatusBadge label="Recorded event log available" tone="success" />
              <StatusBadge label="Observed evidence available" tone="success" />
              <StatusBadge label="Current drift summary available" tone="success" />
              <StatusBadge label={defenseMode ? 'Defense Mode On' : 'Standard View'} tone={defenseMode ? 'success' : 'neutral'} />
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title={
          viewMode === 'feed'
            ? 'Latest First Audit Feed'
            : viewMode === 'policy'
              ? 'Replay Grouped by Policy'
              : 'Replay Grouped by Category'
        }
        description={
          viewMode === 'feed'
            ? 'Chronological operator replay that connects intent changes, verification, evidence, drift, alerts, and recovery context.'
            : viewMode === 'policy'
              ? 'Policy-centric replay that keeps the story of each policy object compact and auditable.'
              : 'Category grouping for quick review of control, evidence, verification, drift, alert, and recovery signals.'
        }
        action={
          <div className="chip-row">
            <StatusBadge
              label={`${formatNumber(filteredItems.length)} visible`}
              tone="neutral"
            />
            <StatusBadge
              label={windowFilter === 'all' ? 'All entries' : `${windowFilter} window`}
              tone="neutral"
            />
          </div>
        }
      >
        {filteredItems.length === 0 ? (
          <EmptyState
            title="No timeline entries match the current filters"
            description="Broaden the recent window, clear the category filter, or remove the replay search to inspect more operational history."
            eyebrow="No matching replay"
            action={
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setWindowFilter('all')
                  setCategoryFilter('all')
                  setSearchTerm('')
                }}
              >
                Reset filters
              </button>
            }
          />
        ) : viewMode === 'feed' ? (
          <div className="timeline-feed">
            {filteredItems.map((item) => (
              <TimelineFeedItem key={item.id} item={item} />
            ))}
          </div>
        ) : viewMode === 'policy' ? (
          <GroupedTimelineView groups={groupedByPolicy} />
        ) : (
          <GroupedTimelineView groups={groupedByCategory} />
        )}
      </Panel>

      <div className="content-grid content-grid--two">
        <Panel
          title="Recent Activity Snapshot"
          description="Small latest-first slice that can be referenced quickly during demo or defense narration."
        >
          {filteredItems.length === 0 ? (
            <EmptyState
              title="No recent activity is visible"
              description="No timeline entries are available for the current window and filters."
              eyebrow="No recent control activity"
            />
          ) : (
            <ul className="entity-list" style={{ marginTop: 0 }}>
              {filteredItems.slice(0, 6).map((item) => (
                <li key={item.id} className="entity-list-item">
                  <div>
                    <div className="entity-list-heading">
                      <strong>{item.title}</strong>
                      <StatusBadge
                        label={getOperationsTimelineCategoryLabel(item.category)}
                        tone={getOperationsTimelineImportanceTone(item.importance)}
                      />
                    </div>
                    <p className="entity-list-meta">{item.summary}</p>
                    <div className="chip-row" style={{ marginTop: '10px' }}>
                      {item.supporting_badges.slice(0, 3).map((badge) => (
                        <StatusBadge
                          key={`${item.id}-recent-${badge.label}`}
                          label={badge.label}
                          tone={badge.tone}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="entity-list-trailing">
                    <strong>{formatDateTime(item.timestamp)}</strong>
                    <div style={{ marginTop: '8px' }}>
                      {item.related_path ? (
                        <Link className="timeline-inline-link" to={item.related_path}>
                          Open {item.related_area}
                        </Link>
                      ) : (
                        item.related_area
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Product Readiness Snapshot"
          description="Why this timeline matters during operator review, defense, or evaluation."
        >
          <div className="timeline-definition-list">
            <div className="timeline-definition-item">
              <strong>Control loop visibility</strong>
              <p>
                The platform now shows intent change, observed evidence, and verification
                history in one replay surface.
              </p>
            </div>
            <div className="timeline-definition-item">
              <strong>Audit-friendly narration</strong>
              <p>
                Recent control activity can be explained through recorded events and honest
                derived timeline entries rather than informal dashboard screenshots alone.
              </p>
            </div>
            <div className="timeline-definition-item">
              <strong>Recovery awareness</strong>
              <p>
                Current baseline or restrictive status is visible, so rollback or recovery
                relevance can be described clearly during demonstration.
              </p>
            </div>
          </div>

          <div className="timeline-link-grid" style={{ marginTop: '18px' }}>
            {Array.from(
              new Set(
                filteredItems
                  .map((item) => item.related_area)
                  .filter((area) => getRouteForArea(area) !== null),
              ),
            )
              .slice(0, 5)
              .map((area) => {
                const path = getRouteForArea(area)
                if (!path) {
                  return null
                }

                return (
                  <Link key={area} className="timeline-inline-link" to={path}>
                    Open {formatLabel(area)}
                  </Link>
                )
              })}
          </div>
        </Panel>
      </div>
    </div>
  )
}
