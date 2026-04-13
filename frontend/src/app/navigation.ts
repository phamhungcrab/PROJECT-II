export const navigationItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    description: 'System health, controller reachability, and topology overview.',
  },
  {
    path: '/alert-center',
    label: 'Alert Center',
    description: 'Operational alerts for drift, stale telemetry, evidence gaps, and demo hygiene.',
  },
  {
    path: '/demo-assistant',
    label: 'Demo Assistant',
    description: 'Scenario runbook, speaker cues, and safe operator actions for defense mode.',
  },
  {
    path: '/policies',
    label: 'Policy Center',
    description: 'Policy objects, compliance drift, and live enforcement evidence.',
  },
  {
    path: '/model-viewer',
    label: 'Model Viewer',
    description:
      'Read-only YANG-lite device and controller state snapshot for defense demo.',
  },
  {
    path: '/topology',
    label: 'Topology',
    description: 'Detailed topology summary, nodes, links, and attachment context.',
  },
  {
    path: '/inventory',
    label: 'Inventory',
    description: 'OpenFlow switch inventory, connector states, and interface counters.',
  },
  {
    path: '/flows',
    label: 'Flows',
    description: 'Per-switch flow tables, matches, actions, and packet statistics.',
  },
] as const
