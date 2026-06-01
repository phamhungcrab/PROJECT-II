# REVERSE LEARNING PLAN

## Goal
Learn the product backward from what is visible in the UI and demo flow, then trace into backend and architecture.

## Learning principle
Do NOT start from random code files.
Start from product surfaces:
1. What the page does
2. What data it displays
3. Which backend/API path supports it
4. Where the evidence comes from
5. Why the design choice was made

## Suggested order

### Day 1 — Whole product story
Understand:
- what the product is
- why it is more than a small demo
- what the main modules are

Read:
- README.md
- docs/PRODUCT_STORY.md
- docs/ARCHITECTURE_OVERVIEW.md

### Day 2 — Core control loop
Understand:
- desired state
- apply
- evidence
- verify
- compliance
- drift
- alert
- recovery
- audit replay

Read:
- docs/CONTROL_FLOW_AND_DATA_FLOW.md
- docs/DEMO_FLOW.md

### Day 3 — Dashboard + Demo Assistant
Questions to answer:
- Why is Dashboard the entry point?
- What does Demo Assistant help with?
- How do they support defense/demo?

### Day 4 — Policy Center + Evidence
Questions to answer:
- What is a policy object?
- How is evidence shown?
- What is verification history?
- What is comparison matrix?
- Why is Template Builder gated?

### Day 5 — Flows / Topology / Inventory
Questions to answer:
- What is shown by controller-facing data?
- What is shown by switch-facing data?
- Why do these views matter for operator trust?

### Day 6 — Alert Center + Metrics Center + Operations Timeline
Questions to answer:
- How does the product go from state display to operational awareness?
- What do alerts mean?
- What do metrics measure?
- Why is timeline useful?

### Day 7 — Model Viewer + Future work
Questions to answer:
- Why is it called YANG-lite?
- Why is it read-only?
- What is implemented vs future work?
- What is the safe next extension path?

## Final knowledge goal
The student should be able to explain:
- the architecture
- the practical enforcement path
- why OVS-direct is used
- how verification and evidence work
- what drift means
- what each major page contributes
- what is real, partial, gated, or future work
