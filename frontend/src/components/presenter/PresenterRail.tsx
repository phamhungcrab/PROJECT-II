import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { presenterHotkeyLabel, requestPresenterRefresh } from '../../app/presenterDirector'
import { useApiResource } from '../../hooks/useApiResource'
import { policyApi } from '../../services/api/policyApi'
import { sdnApi } from '../../services/api/sdnApi'
import type { AlertSummary } from '../../types/alerts'
import type {
  DemoPolicyStatusResponse,
  PolicyDriftSummaryResponse,
  PolicyEventsResponse,
  PolicySummaryResponse,
} from '../../types/policy'
import type {
  HealthResponse,
  InventoryNodesResponse,
  OvsLiveFlowsResponse,
} from '../../types/sdn'
import { buildOperationalAlerts, summarizeAlerts } from '../../utils/alertCenter'
import { formatDateTime, formatNumber } from '../../utils/formatters'
import { StatusBadge } from '../ui/StatusBadge'

type PresenterSceneId =
  | 'baseline'
  | 'ping-block'
  | 'http-block'
  | 'host-isolation'
  | 'metrics'
  | 'timeline'
  | 'model'
  | 'alerts'

interface PresenterSceneDefinition {
  id: PresenterSceneId
  label: string
  path: string
  helper: string
  narration: string
  pointAt: string
  proof: string
  recovery: string
}

interface PresenterOverlayData {
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
  alertsSummary: AlertSummary
}

interface PresenterSnapshot {
  capturedAt: string
  checkedAt: string
  controllerReachable: boolean
  baselineReady: boolean
  activeAlertCount: number
  evidenceAvailable: boolean
  recentVerificationPresent: boolean
  recentControlActivityCount: number
  enabledPolicyCount: number
  driftCount: number
  restrictivePolicyCount: number
}

interface PresenterRailProps {
  defenseMode: boolean
  presenterMode: boolean
  spotlightMode: boolean
  onTogglePresenterMode: () => void
  onToggleSpotlightMode: () => void
  onClose: () => void
}

const recentVerificationWindowMinutes = 30
const recentControlWindowMinutes = 30

const presenterScenes: PresenterSceneDefinition[] = [
  {
    id: 'baseline',
    label: 'Baseline',
    path: '/dashboard',
    helper: 'Open the stable entry-point snapshot.',
    narration:
      'Start from the live operator overview and establish that the controller, topology, and baseline state are visible before any restrictive policy is applied.',
    pointAt:
      'Controller reachability, topology counts, and the baseline or recovery messaging on the main overview.',
    proof:
      'Dashboard health, topology inventory, and the current baseline-ready or recovery-ready status.',
    recovery:
      'Recover Baseline remains available if the lab needs immediate realignment before the next scene.',
  },
  {
    id: 'ping-block',
    label: 'Ping Block Demo',
    path: '/policies',
    helper: 'Move to live policy control and verification.',
    narration:
      'Explain that policy intent is not static documentation: the operator can enforce an ICMP block and verify that the live state matches the requested control intent.',
    pointAt:
      'Policy inventory, compliance state, evidence workspace, and verification controls for the ping-block policy.',
    proof:
      'Policy Center compliance, verification history, and OVS evidence confirming the enforcement footprint.',
    recovery:
      'Rollback the restrictive policy or use baseline recovery if the lab should return to the open forwarding posture.',
  },
  {
    id: 'http-block',
    label: 'HTTP Block Demo',
    path: '/policies',
    helper: 'Stay in Policy Center and shift the story to TCP/80.',
    narration:
      'Show that the product can move from coarse ICMP controls to application-oriented traffic restrictions while preserving the same evidence and verification loop.',
    pointAt:
      'Policy details, compliance badges, and related evidence for the HTTP block scenario.',
    proof:
      'Verification output, evidence snapshots, and matching flow exposure in the Flows page if you need switch-side confirmation.',
    recovery:
      'Policy rollback and baseline restore remain the safe exit paths after the HTTP restriction is demonstrated.',
  },
  {
    id: 'host-isolation',
    label: 'Host Isolation Demo',
    path: '/policies',
    helper: 'Use Policy Center for the strongest restrictive scene.',
    narration:
      'Describe host isolation as a broader containment example that shows the system can enforce stronger intent while still preserving auditability and recovery.',
    pointAt:
      'Policy Center drift/compliance state and the evidence area that shows the isolation posture.',
    proof:
      'Current policy live state, verification history, and supporting evidence snapshots tied to the isolation object.',
    recovery:
      'Host isolation should be rolled back or baseline recovery should be invoked before leaving the restrictive demo segment.',
  },
  {
    id: 'metrics',
    label: 'Metrics Snapshot',
    path: '/metrics-center',
    helper: 'Shift from control to quantified evaluation.',
    narration:
      'Explain that the platform does not only push controls; it also measures compliance, evidence coverage, drift, and readiness using current platform state.',
    pointAt:
      'Metrics summary cards, verification coverage bars, and readiness or evidence coverage sections.',
    proof:
      'Current compliance ratio, evidence-backed policy counts, drift totals, and recent control activity metrics.',
    recovery:
      'If readiness signals degrade, return to Policy Center or Dashboard before continuing the presentation.',
  },
  {
    id: 'timeline',
    label: 'Operations Timeline',
    path: '/operations-timeline',
    helper: 'Use the audit replay as the chronological story surface.',
    narration:
      'Frame the product as an auditable control loop: intent changes, verification, evidence, alerts, and recovery context are visible in one chronological story.',
    pointAt:
      'The latest-first audit feed, grouped replay modes, and the recent activity snapshot.',
    proof:
      'Recorded events, observed evidence, verification history, and clearly labeled derived timeline entries for drift or alert state.',
    recovery:
      'Use the replay to show when recovery became relevant and where the operator would move next.',
  },
  {
    id: 'model',
    label: 'Model Viewer',
    path: '/model-viewer',
    helper: 'Move the story toward model-driven management.',
    narration:
      'Explain that the product is evolving beyond policies and flows into a structured, read-only YANG-lite model view of controller and device state.',
    pointAt:
      'The node selector, model context, config-versus-operational split, and source lineage badges.',
    proof:
      'Read-only model snapshot structure, controller-derived lineage, and operational or inventory-linked fields.',
    recovery:
      'This scene is informational and read-only, so the safe exit path is simply returning to an operational control page.',
  },
  {
    id: 'alerts',
    label: 'Alert Center',
    path: '/alert-center',
    helper: 'Show quantified fault or watch signals.',
    narration:
      'Describe how the console surfaces drift, stale telemetry, evidence gaps, and demo hygiene as explicit operational alerts rather than implicit operator guesswork.',
    pointAt:
      'Active alert cards, severity badges, suggested actions, and linked remediation paths.',
    proof:
      'Current alert counts, severity distribution, and navigable follow-up actions into Policy Center, Flows, or Dashboard.',
    recovery:
      'Alerts can be used to justify a pause, a verification pass, or a baseline restore before the next scene.',
  },
]

function getDefaultSceneId(pathname: string): PresenterSceneId | null {
  if (pathname.startsWith('/dashboard')) {
    return 'baseline'
  }

  if (pathname.startsWith('/metrics-center')) {
    return 'metrics'
  }

  if (pathname.startsWith('/operations-timeline')) {
    return 'timeline'
  }

  if (pathname.startsWith('/model-viewer')) {
    return 'model'
  }

  if (pathname.startsWith('/alert-center')) {
    return 'alerts'
  }

  return null
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

function isRecentTimestamp(
  timestamp: string | null | undefined,
  windowMinutes: number,
) {
  if (!timestamp) {
    return false
  }

  const parsedTimestamp = new Date(timestamp)
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return false
  }

  return Date.now() - parsedTimestamp.getTime() <= windowMinutes * 60 * 1000
}

function getStatusTone(active: boolean) {
  return active ? ('success' as const) : ('warning' as const)
}

export function PresenterRail({
  defenseMode,
  presenterMode,
  spotlightMode,
  onTogglePresenterMode,
  onToggleSpotlightMode,
  onClose,
}: PresenterRailProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const [activeSceneId, setActiveSceneId] = useState<PresenterSceneId>('baseline')
  const [recoverBaselineLoading, setRecoverBaselineLoading] = useState(false)
  const [recoverBaselineMessage, setRecoverBaselineMessage] = useState<string | null>(null)
  const [recoverBaselineError, setRecoverBaselineError] = useState<string | null>(null)
  const [frozenSnapshot, setFrozenSnapshot] = useState<PresenterSnapshot | null>(null)

  useEffect(() => {
    const routeScene = getDefaultSceneId(location.pathname)
    if (routeScene) {
      setActiveSceneId(routeScene)
    }
  }, [location.pathname])

  const { data, isLoading } = useApiResource<PresenterOverlayData>(async () => {
    const [health, inventory, policySummary, policyEvents, driftSummary, demoStatus, ovsEvidence] =
      await Promise.all([
        loadSource(() => sdnApi.getHealth()),
        loadSource(() => sdnApi.getInventoryNodes()),
        loadSource(() => policyApi.getSummary()),
        loadSource(() => policyApi.getEvents()),
        loadSource(() => policyApi.getDriftSummary()),
        loadSource(() => policyApi.getDemoStatus()),
        loadSource(() => sdnApi.getOvsFlows()),
      ])

    const alerts = buildOperationalAlerts({
      checkedAt: new Date().toISOString(),
      health: health.data,
      healthError: health.error,
      inventory: inventory.data,
      policySummary: policySummary.data,
      policySummaryError: policySummary.error,
      driftSummary: driftSummary.data,
      driftError: driftSummary.error,
      demoStatus: demoStatus.data,
      demoStatusError: demoStatus.error,
      ovsEvidence: ovsEvidence.data,
      ovsEvidenceError: ovsEvidence.error,
    })

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
      alertsSummary: summarizeAlerts(alerts),
    }
  }, [])

  const restrictivePolicyCount = [
    data?.demoStatus?.block_ping_enabled,
    data?.demoStatus?.block_http_enabled,
    data?.demoStatus?.isolate_h1_enabled,
  ].filter(Boolean).length
  const recentVerificationCount =
    data?.policySummary?.policies.filter((policy) =>
      isRecentTimestamp(policy.last_verified_at, recentVerificationWindowMinutes),
    ).length ?? 0
  const recentControlActivityCount =
    data?.policyEvents?.events.filter((event) =>
      isRecentTimestamp(event.timestamp, recentControlWindowMinutes),
    ).length ?? 0
  const liveSnapshot: PresenterSnapshot = {
    capturedAt: new Date().toISOString(),
    checkedAt: data?.checkedAt ?? new Date().toISOString(),
    controllerReachable: data?.health?.status === 'ok',
    baselineReady:
      Boolean(data?.demoStatus?.base_forwarding_enabled) && restrictivePolicyCount === 0,
    activeAlertCount: data?.alertsSummary.active_alerts ?? 0,
    evidenceAvailable: (data?.ovsEvidence?.flow_count ?? 0) > 0,
    recentVerificationPresent: recentVerificationCount > 0,
    recentControlActivityCount,
    enabledPolicyCount: data?.policySummary?.enabled_policies ?? 0,
    driftCount: data?.driftSummary?.drift_count ?? 0,
    restrictivePolicyCount,
  }
  const displayedSnapshot = frozenSnapshot ?? liveSnapshot
  const activeScene =
    presenterScenes.find((scene) => scene.id === activeSceneId) ?? presenterScenes[0]

  async function handleRecoverBaseline() {
    setRecoverBaselineLoading(true)
    setRecoverBaselineMessage(null)
    setRecoverBaselineError(null)

    try {
      await policyApi.recoverBaselineDemo()
      setActiveSceneId('baseline')
      setRecoverBaselineMessage(
        'Baseline recovery was requested. Current views are refreshing now.',
      )
      requestPresenterRefresh()
      navigate('/dashboard')
    } catch (error) {
      setRecoverBaselineError(
        error instanceof Error
          ? error.message
          : 'Baseline recovery request failed unexpectedly.',
      )
    } finally {
      setRecoverBaselineLoading(false)
    }
  }

  function handleSceneOpen(scene: PresenterSceneDefinition) {
    setActiveSceneId(scene.id)
    if (location.pathname === scene.path) {
      requestPresenterRefresh()
      return
    }

    navigate(scene.path)
  }

  function handleFreezeToggle() {
    if (frozenSnapshot) {
      setFrozenSnapshot(null)
      return
    }

    setFrozenSnapshot(liveSnapshot)
  }

  return (
    <aside className="presenter-rail" aria-label="Presenter overlay and demo director">
      <div className="presenter-rail-header">
        <div>
          <div className="presenter-rail-topline">
            <div className="presenter-rail-heading">
              <span className="eyebrow">Presenter Overlay</span>
              <div className="chip-row">
                <StatusBadge
                  label={frozenSnapshot ? 'Frozen overlay' : 'Live overlay'}
                  tone={frozenSnapshot ? 'warning' : 'success'}
                />
                <StatusBadge
                  label={
                    defenseMode
                      ? 'Defense Mode'
                      : presenterMode
                        ? 'Presenter Mode'
                        : 'Standard'
                  }
                  tone={defenseMode || presenterMode ? 'success' : 'neutral'}
                />
              </div>
            </div>
            <button
              className="presenter-rail-collapse"
              type="button"
              onClick={onClose}
              aria-label="Collapse presenter rail"
            >
              Collapse
            </button>
          </div>
          <h3 className="presenter-rail-title">Demo Director</h3>
          <p className="presenter-rail-subtitle">
            Compact scene control, narration cues, and readiness context for a cleaner
            defense flow.
          </p>
        </div>

        <div className="presenter-rail-toolbar">
          <button className="button button--ghost" type="button" onClick={handleFreezeToggle}>
            {frozenSnapshot ? 'Return to live' : 'Freeze snapshot'}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={onToggleSpotlightMode}
            aria-pressed={spotlightMode}
          >
            {spotlightMode ? 'Disable spotlight' : 'Enable spotlight'}
          </button>
        </div>
      </div>

      <div className="presenter-rail-scroll">
        <section className="presenter-section">
          <div className="subsection-header" style={{ marginTop: 0 }}>
            <div>
              <h4>Session State</h4>
              <p>Live presenter helper state backed by current product data.</p>
            </div>
            <span className="subsection-metric mono">{formatDateTime(displayedSnapshot.checkedAt)}</span>
          </div>

          {frozenSnapshot ? (
            <div className="notice notice--warning" style={{ marginTop: '14px' }}>
              Overlay snapshot is frozen from {formatDateTime(frozenSnapshot.capturedAt)}. The
              current page may still refresh independently.
            </div>
          ) : null}

          <div className="presenter-checklist">
            <div className="presenter-check-item">
              <div className="presenter-check-copy">
                <strong>Controller reachable</strong>
                <p>
                  {displayedSnapshot.controllerReachable
                    ? 'Health API confirms the controller is reachable.'
                    : 'Controller health needs attention before the next scene.'}
                </p>
              </div>
              <StatusBadge
                label={displayedSnapshot.controllerReachable ? 'Reachable' : 'Review'}
                tone={getStatusTone(displayedSnapshot.controllerReachable)}
              />
            </div>
            <div className="presenter-check-item">
              <div className="presenter-check-copy">
                <strong>Baseline ready</strong>
                <p>
                  {displayedSnapshot.baselineReady
                    ? 'Baseline forwarding is active with no restrictive demo policy left enabled.'
                    : `${formatNumber(displayedSnapshot.restrictivePolicyCount)} restrictive policies remain active.`}
                </p>
              </div>
              <StatusBadge
                label={displayedSnapshot.baselineReady ? 'Ready' : 'Recovery relevant'}
                tone={getStatusTone(displayedSnapshot.baselineReady)}
              />
            </div>
            <div className="presenter-check-item">
              <div className="presenter-check-copy">
                <strong>Active alerts count</strong>
                <p>
                  {displayedSnapshot.activeAlertCount === 0
                    ? 'No active alert or drift signals are currently visible.'
                    : 'Active alert or drift signals should be acknowledged before continuing.'}
                </p>
              </div>
              <StatusBadge
                label={formatNumber(displayedSnapshot.activeAlertCount)}
                tone={displayedSnapshot.activeAlertCount === 0 ? 'success' : 'warning'}
              />
            </div>
            <div className="presenter-check-item">
              <div className="presenter-check-copy">
                <strong>Evidence available</strong>
                <p>
                  {displayedSnapshot.evidenceAvailable
                    ? 'Live OVS evidence is visible for the current operator snapshot.'
                    : 'Switch-side evidence is not currently visible.'}
                </p>
              </div>
              <StatusBadge
                label={displayedSnapshot.evidenceAvailable ? 'Available' : 'Unavailable'}
                tone={getStatusTone(displayedSnapshot.evidenceAvailable)}
              />
            </div>
            <div className="presenter-check-item">
              <div className="presenter-check-copy">
                <strong>Recent verification present</strong>
                <p>
                  {displayedSnapshot.recentVerificationPresent
                    ? `${formatNumber(recentVerificationCount)} policies were verified in the recent operator window.`
                    : 'No recent verification was recorded in the current window.'}
                </p>
              </div>
              <StatusBadge
                label={displayedSnapshot.recentVerificationPresent ? 'Present' : 'Stale'}
                tone={getStatusTone(displayedSnapshot.recentVerificationPresent)}
              />
            </div>
          </div>

          <div className="chip-row" style={{ marginTop: '14px' }}>
            <span className="chip">
              Enabled policies: {formatNumber(displayedSnapshot.enabledPolicyCount)}
            </span>
            <span className="chip">
              Recent control activity: {formatNumber(displayedSnapshot.recentControlActivityCount)}
            </span>
            <span className="chip">Drift count: {formatNumber(displayedSnapshot.driftCount)}</span>
          </div>
        </section>

        <section className="presenter-section">
          <div className="subsection-header" style={{ marginTop: 0 }}>
            <div>
              <h4>Scene Shortcuts</h4>
              <p>Navigate safely through the defense story without inventing automation.</p>
            </div>
            <span className="subsection-metric">{presenterHotkeyLabel}</span>
          </div>

          <div className="presenter-scene-grid">
            {presenterScenes.map((scene) => (
              <button
                key={scene.id}
                className={`presenter-scene-button${
                  scene.id === activeScene.id ? ' presenter-scene-button--active' : ''
                }`}
                type="button"
                onClick={() => handleSceneOpen(scene)}
              >
                <strong>{scene.label}</strong>
                <span>{scene.helper}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="presenter-section presenter-section--accent">
          <div className="subsection-header" style={{ marginTop: 0 }}>
            <div>
              <h4>Active Scene Cue</h4>
              <p>Short speaking prompts for the current demo segment.</p>
            </div>
            <StatusBadge label={activeScene.label} tone="success" />
          </div>

          <div className="presenter-cue-grid">
            <div className="presenter-cue-item">
              <span>What to say</span>
              <p>{activeScene.narration}</p>
            </div>
            <div className="presenter-cue-item">
              <span>What to point at</span>
              <p>{activeScene.pointAt}</p>
            </div>
            <div className="presenter-cue-item">
              <span>Evidence that proves the point</span>
              <p>{activeScene.proof}</p>
            </div>
            <div className="presenter-cue-item">
              <span>Recovery path</span>
              <p>{activeScene.recovery}</p>
            </div>
          </div>
        </section>

        <section className="presenter-section">
          <div className="subsection-header" style={{ marginTop: 0 }}>
            <div>
              <h4>Quick Actions</h4>
              <p>Safe navigation and refresh actions for the current presentation flow.</p>
            </div>
            <span className="subsection-metric">No hidden automation</span>
          </div>

          <div className="presenter-quick-grid">
            <Link className="presenter-quick-link" to="/policies">
              Open Policy Center
            </Link>
            <Link className="presenter-quick-link" to="/flows">
              Open Flows
            </Link>
            <Link className="presenter-quick-link" to="/metrics-center">
              Open Metrics Center
            </Link>
            <Link className="presenter-quick-link" to="/operations-timeline">
              Open Operations Timeline
            </Link>
            <Link className="presenter-quick-link" to="/demo-assistant">
              Open Demo Assistant
            </Link>
            <button
              className="presenter-quick-link presenter-quick-link--button"
              type="button"
              onClick={requestPresenterRefresh}
            >
              Refresh current page state
            </button>
            <button
              className="presenter-quick-link presenter-quick-link--button"
              type="button"
              onClick={handleRecoverBaseline}
              disabled={recoverBaselineLoading}
            >
              {recoverBaselineLoading ? 'Recovering baseline...' : 'Recover Baseline'}
            </button>
            <button
              className="presenter-quick-link presenter-quick-link--button"
              type="button"
              onClick={onTogglePresenterMode}
            >
              {presenterMode ? 'Disable Presenter Mode' : 'Enable Presenter Mode'}
            </button>
          </div>

          {recoverBaselineMessage ? (
            <div className="presenter-inline-status presenter-inline-status--success">
              {recoverBaselineMessage}
            </div>
          ) : null}
          {recoverBaselineError ? (
            <div className="presenter-inline-status presenter-inline-status--danger">
              {recoverBaselineError}
            </div>
          ) : null}
          {isLoading && !data ? (
            <div className="presenter-inline-status presenter-inline-status--neutral">
              Loading presenter readiness from current controller, policy, evidence, and alert
              state.
            </div>
          ) : null}
        </section>
      </div>
    </aside>
  )
}
