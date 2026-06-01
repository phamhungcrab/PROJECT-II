# AI HANDOFF CONTEXT — SDN Management Product

## Identity
- Student name: Phạm Ngọc Hưng
- Student ID: 20235342
- Project type: Graduation project / SDN Management product
- Main goal: Build a practical SDN management product, not a superficial demo

## Core technical stack
- OS: Ubuntu 24.04.4
- Controller: OpenDaylight Vanadium / Karaf
- Lab: Mininet + Open vSwitch
- Backend: FastAPI
- Frontend: React + Vite + TypeScript
- Northbound integration: RESTCONF
- Practical control path: OVS-direct for reliable demo enforcement
- Important constraint: No core Java plugin dependency in the current product path

## Key architectural truth
This product is not presented as a pure controller-only flow programming system.
It is a practical SDN management product that combines:
- OpenDaylight + RESTCONF for controller/inventory/topology/flow visibility
- OVS-direct for reliable live policy enforcement in the lab
- FastAPI as the orchestration and product backend
- React frontend as the operator console

## What is actually implemented
### Core pages/modules
- Dashboard
- Policy Center
- Demo Assistant
- Flows
- Topology
- Inventory
- Model Viewer v2
- Alert Center
- Metrics Center
- Operations Timeline / Audit Replay
- Defense Mode
- Presenter Overlay / Demo Director
- Final Defense Pack

### Policy / enforcement features
Seeded policies exist and are working:
- baseline_forwarding
- block_ping_h1_h2
- block_http_h1_h2
- isolate_h1

Implemented lifecycle concepts:
- desired state
- apply
- evidence
- verification
- compliance
- drift
- alert
- recovery
- operations replay

### Evidence / validation surfaces
- OVS live flow evidence
- Policy evidence
- Verification history
- Drift summary
- Alert synthesis
- Metrics summary
- Controller vs Switch comparison
- Audit replay / operations timeline

### Model-driven / controller-side depth
- Model Viewer v2 exists
- This is YANG-lite / read-only / partial
- It is not full NETCONF management
- It is a safe model-driven projection built from existing controller/inventory/topology data

## Important product truth
### Primary practical execution path
- OVS-direct remains the main practical enforcement path

### Data/integration path
- ODL/RESTCONF is used for controller-facing visibility, topology, inventory, and flow context

### What is not claimed
The product does NOT currently claim:
- full controller-only enforcement
- full multi-vendor NETCONF support
- full gNMI/OpenConfig support
- ODL clustering
- cloud-native/Kubernetes production deployment
- full config-write model-driven device management

## Policy Template Builder status
- Template Builder exists in code/UI as a capability-gated feature
- It must only be treated as active when backend capability is present
- If backend does not expose template endpoints, it must remain unavailable/gated
- Do not describe it as fully live unless backend deployment truly supports it

## UI/UX state
- Sidebar scroll has been polished and separated cleanly from footer
- Navigation uses shared route registry to prevent sidebar/router drift
- Metrics Center route must be treated as real and working
- Presenter Overlay now exists as a real rail, not just a weak launcher
- Defense Mode auto-opens Presenter Rail by default

## Product positioning
This is not a small SDN demo.
This is an SDN management product with:
- policy lifecycle
- live enforcement evidence
- verification and compliance
- drift detection
- alert/fault visibility
- metrics/evaluation
- audit replay
- model-driven read-only state view
- defense/presenter layer

## Recommended product story
The operator defines or selects policy intent, the system applies practical enforcement, verifies live evidence, detects drift, exposes alerts and metrics, and provides auditable replay plus a model-driven state view.

## Known future-work boundaries
Safe future work:
- capability/platform status layer
- richer session report/export
- deeper model-driven read-only projection
- limited controller experimental mode
- stronger documentation and reporting

Larger future work, not current implementation:
- Java plugin expansion in ODL
- ODL clustering
- controller-only execution replacing OVS-direct
- full multi-vendor NETCONF
- full gNMI/OpenConfig stack
- cloud-native platformization

## Working style requested by the user
- Keep responses practical, direct, and implementation-oriented
- Prefer batch-mode work
- When using Codex-like workflow, output should focus on:
  1. Files changed
  2. What changed
  3. Validation
  4. Notes
- Avoid dumping full files unless debugging is necessary
- Prefer making stable progress without breaking the lab
- If a feature is not truly live, say so honestly
- The user may want to learn backward from the product, so explanations should be able to start from current product behavior and trace back into architecture and code

## Current stopping point
The product is already deep enough to be treated as a strong final product baseline.
From this point onward, the preferred direction is:
- understand it thoroughly
- document it properly
- only expand carefully if truly needed
