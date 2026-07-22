# Phase 8: PhysX Physics and Layered USD

- Track: Spatial
- Status: Completed July 21, 2026 (external Isaac Sim QA pending)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (spatial track, item 8)
- Tracker: [smart-warehouse-codegen-future-work.md](../smart-warehouse-codegen-future-work.md) (P2)
- Reference: [examples/omniverse-assets/warehouse_sim/README.md](../examples/omniverse-assets/warehouse_sim/README.md)

## Goal

Add real PhysX dynamics to the simulation and split the generated USD into
layout, asset, physics, and simulation layers.

## Why

The simulation is kinematic today: the nav brain moves robots and the bridge sets
transforms, with colliders added only for reference. Real physics (rigid bodies,
contacts, optional articulation) makes the twin believable and lets the scene be
used for physics-based tasks. Layered USD keeps layout, physics, and simulation
concerns separable and reusable.

## Scope

In:
- PhysicsScene, ground, and collision approximations on static props.
- Robots as dynamic or kinematic rigid bodies with proper mass/collision.
- Optional robot articulation or a supported Isaac Sim robot reference.
- Code generation splits output into `warehouse_layout.usda`,
  `warehouse_assets.usda`, `warehouse_physics.usda`, `warehouse_simulation.usda`.

Out (later):
- Full controller-in-the-loop dynamics tuning; sensor simulation.

## Tasks

- [x] Add rigid-body/collision schemas to the bridge and props (layered).
- [x] Provide a dynamic-control option alongside the kinematic mover.
- [x] Add articulation or a supported Isaac Sim robot reference behind a flag.
- [x] Generate separate USD layers from the model in the Omniverse template.
- [x] Validate: `usdchecker` on layers; `py_compile` the generated scripts.
- [ ] Manual Isaac Sim run with Play, confirming physical behavior.

## Verification

- [x] `usdchecker` passes on each generated layer; scripts `py_compile`.
- [x] Navigation, brain, manifest, and runtime-mode Python tests pass.
- [ ] Manual Isaac Sim run shows physically-grounded robots and static colliders.

Automated evidence is recorded in
[`docs/qa/roadmap-phases-06-09-2026-07-21.md`](../docs/qa/roadmap-phases-06-09-2026-07-21.md).

## Follow-ups

- Instanceable references for repeated static assets; navigation/event logic layer.
