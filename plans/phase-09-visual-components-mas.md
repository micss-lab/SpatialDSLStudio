# Phase 9: Visual Components MAS Wiring

- Track: Spatial
- Status: Completed July 21, 2026 (external Visual Components QA pending)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (spatial track, item 9)
- Tracker: [smart-warehouse-codegen-future-work.md](../smart-warehouse-codegen-future-work.md) (P3)
- Reference: [docs/user-guide/visual-components-code-generation.md](../docs/user-guide/visual-components-code-generation.md)

## Goal

Make the generated Visual Components JADE MAS config consume the model's control
layer (WarehouseController, Task, Product), so both target platforms use the same
modeled intent.

## Why

The model now has a control layer, and the Isaac Sim brain already speaks the
WarehouseMAS OPC UA node layout. But the generated `Config.java` still hard-codes a
coordinator and ignores Controller/Task/Product. Wiring these closes the gap so the
Visual Components MAS and the Isaac Sim brain are driven by the same model.

## Scope

In:
- Update the Visual Components project templates to emit controller, task, and
  product configuration from `elementsByClassName` and references.
- Align OPC UA node names/behaviors with the model's control-layer entities.

Out (later):
- Full JADE agent behavior generation; live WarehouseMAS server testing.

## Tasks

- [x] Extend `Config.java` template to read WarehouseController and Task entities.
- [x] Emit task pickup/dropoff and controller policy from the model.
- [x] Keep node IDs consistent with the Isaac Sim OPC UA contract.
- [x] Update `smart-warehouse-codegen-projects` tests for the new config output.
- [ ] Manual: load the output in Visual Components and test against WarehouseMAS.

## Verification

- [x] The codegen projects test asserts generated controller, task, product, and
  shared OPC UA configuration.
- [x] Generated Java sources compile with `javac` 21.
- [ ] Generated output loads in Visual Components (manual, per the VC guide).

Automated evidence is recorded in
[`docs/qa/roadmap-phases-06-09-2026-07-21.md`](../docs/qa/roadmap-phases-06-09-2026-07-21.md).

## Follow-ups

- Test generated OPC UA node IDs against the live WarehouseMAS server.
