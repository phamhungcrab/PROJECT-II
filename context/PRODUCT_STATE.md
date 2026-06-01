# PRODUCT STATE

## Current status
The product is stable and feature-rich enough to serve as the main graduation-project product baseline.

## Stable modules
- Dashboard
- Policy Center
- Demo Assistant
- Flows
- Topology
- Inventory
- Model Viewer v2
- Alert Center
- Metrics Center
- Operations Timeline
- Presenter Overlay
- Defense Mode
- Final Defense Pack

## Stable practical capabilities
- Live OVS evidence
- Verification
- Compliance
- Drift
- Alerts
- Metrics
- Audit replay
- Recovery / baseline restore

## Stable seeded policies
- Baseline Forwarding
- Block Ping h1 <-> h2
- Block HTTP h1 <-> h2
- Isolate h1

## Runtime / deployment truth
- OVS-direct is the main live execution path
- ODL/RESTCONF provides controller-facing state/inventory/topology/flow visibility
- Template Builder may be gated depending on backend capability
- Model Viewer is partial/read-only/YANG-lite

## What should be considered final enough
- current control loop
- current evidence pipeline
- current alerting
- current metrics
- current audit replay
- current defense/demo support

## What should not be misrepresented
- Do not claim full NETCONF stack
- Do not claim full controller-only policy enforcement
- Do not claim cluster/controller HA
- Do not claim cloud-native production platform
