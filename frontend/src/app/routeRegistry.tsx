import type { ReactElement } from 'react'
import { AlertCenterPage } from '../pages/AlertCenterPage'
import { DashboardPage } from '../pages/DashboardPage'
import { DemoAssistantPage } from '../pages/DemoAssistantPage'
import { FlowsPage } from '../pages/FlowsPage'
import { InventoryPage } from '../pages/InventoryPage'
import { MetricsCenterPage } from '../pages/MetricsCenterPage'
import { ModelViewerPage } from '../pages/ModelViewerPage'
import { PolicyCenterPage } from '../pages/PolicyCenterPage'
import { TopologyPage } from '../pages/TopologyPage'

interface AppRouteDefinition {
  path: string
  label: string
  description: string
  element: ReactElement
}

export const defaultRoutePath = '/dashboard'

export const appRoutes: AppRouteDefinition[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    description: 'System health, controller reachability, and topology overview.',
    element: <DashboardPage />,
  },
  {
    path: '/alert-center',
    label: 'Alert Center',
    description:
      'Operational alerts for drift, stale telemetry, evidence gaps, and demo hygiene.',
    element: <AlertCenterPage />,
  },
  {
    path: '/metrics-center',
    label: 'Metrics Center',
    description: 'Evaluation metrics, evidence coverage, and readiness snapshot.',
    element: <MetricsCenterPage />,
  },
  {
    path: '/demo-assistant',
    label: 'Demo Assistant',
    description:
      'Scenario runbook, speaker cues, and safe operator actions for defense mode.',
    element: <DemoAssistantPage />,
  },
  {
    path: '/policies',
    label: 'Policy Center',
    description: 'Policy objects, compliance drift, and live enforcement evidence.',
    element: <PolicyCenterPage />,
  },
  {
    path: '/model-viewer',
    label: 'Model Viewer',
    description:
      'Read-only YANG-lite device and controller state snapshot for defense demo.',
    element: <ModelViewerPage />,
  },
  {
    path: '/topology',
    label: 'Topology',
    description: 'Detailed topology summary, nodes, links, and attachment context.',
    element: <TopologyPage />,
  },
  {
    path: '/inventory',
    label: 'Inventory',
    description:
      'OpenFlow switch inventory, connector states, and interface counters.',
    element: <InventoryPage />,
  },
  {
    path: '/flows',
    label: 'Flows',
    description: 'Per-switch flow tables, matches, actions, and packet statistics.',
    element: <FlowsPage />,
  },
]
