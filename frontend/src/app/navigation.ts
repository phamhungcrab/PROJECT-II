export const navigationItems = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    description: 'System health, controller reachability, and topology overview.',
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
