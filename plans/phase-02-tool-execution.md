# Phase 2: Tool Execution and Operation Language

- Track: Workbench
- Status: Complete (July 21, 2026)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (near term, item 2)
- Tracker: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md) (Area 3)
- Depends on: shipped tool editor (PR #37)

## Goal

Make authored tool definitions actually run: palette creation tools, delete, and
reconnect, backed by a minimal model-operation language.

## Why

Tools are authorable but inert today; the palette still builds only from creatable
metaclasses. Execution is where the representation-specific tooling becomes
interactive and where SpatialDSL starts to feel like a real editor, not just a
specifier.

## Scope

In:
- Diagram palette reads `toolDefinitions` and renders named create-node and
  create-edge entries (falling back to creatable metaclasses when there are none).
- Executing a create-node tool creates a model element of its target metaclass;
  a create-edge tool creates the reference edge.
- Delete and reconnect tools wired into the view editor interactions.
- A minimal, safe operation payload (for example set-attribute on create) stored
  on the tool and applied on execution.

Out (later):
- A full Sirius-style expression/action language; direct-edit tool logic beyond
  label editing.

## Tasks

- [x] Extend `DiagramPalette` to render tool-driven entries from `toolDefinitions`.
- [x] Execute create-node/create-edge tools via the model/diagram services.
- [x] Wire delete and reconnect tools into `DiagramEditor` interactions.
- [x] Define and apply a minimal operation payload schema on `ToolDefinition.payload`.
- [x] Tests: palette renders tool entries; create-node tool creates an element; delete tool removes one.

## Verification

- Palette and execution unit tests pass.
- On the Smart Warehouse model, a create-node tool adds an element and a delete
  tool removes one through the view editor.

Completed with focused palette/service tests and a component-level Smart
Warehouse editor workflow covering authored create-node and semantic delete
tools. The bundled create tool initializes `BatteryLevel` and `HasProduct` via
the safe operation payload.

Final verification on July 21, 2026:

- frontend: 40 suites, 271 tests passed
- backend: 29 suites, 582 tests passed
- frontend and backend production builds passed
- frontend TypeScript check and backend lint passed
- example viewpoint JSON and `git diff --check` passed

## Follow-ups

- Round-trip richer tool semantics through `.odesign` (currently name-only).
