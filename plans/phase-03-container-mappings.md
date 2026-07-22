# Phase 3: Container Mappings

- Track: Workbench
- Status: Complete (July 21, 2026)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (near term, item 3)
- Tracker: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md) (Area 2)
- Depends on: node/edge mapping editors (PR #36)

## Goal

Support Sirius container mappings: nodes that visually contain other nodes, driven
by a containment reference.

## Why

Many domain languages are containment-heavy (a system contains components, a
process contains activities). Without container mappings these cannot be drawn
faithfully, and `.aird`/`.odesign` from real Sirius projects that use containers
cannot round-trip. This is the one deferred piece from the mapping-editor work.

## Scope

In:
- A `containerMappings` concept on the representation description (which metaclass
  is a container, via which containment reference it holds children).
- A container mapping editor in the representation editor.
- View projection nests child nodes inside their container node.
- `.odesign` `containerMappings` export/import and `.aird` GMF child nesting.

Out (later):
- Free-form (non-containment) visual grouping; compartments.

## Tasks

- [x] Add `containerMappings` to `RepresentationDescription` (shared + frontend types).
- [x] Container mapping editor UI in `ViewpointManager` (metaclass + containment reference + style).
- [x] Update `view-projection.service` to nest children under container nodes.
- [x] Update `DiagramEditor` rendering for nested/containing nodes.
- [x] `.odesign`: emit and parse `containerMappings` in `sirius-interop.service`.
- [x] `.aird`: nest GMF `children` under the container node on export; read nesting on import.
- [x] Tests: container round-trip (odesign + aird), projection nesting.

## Verification

- Backend round-trip tests for container mappings in `.odesign` and `.aird`.
- A model with a containment reference renders nested nodes in a view.

Completed verification covers `.odesign` mapping/style round-trip, `.aird`
nested-GMF import/export with relative coordinates, projection hierarchy and
containment-edge suppression, representation authoring/JSON normalization, and
the bundled UML Activity example with two mapped activity containers.

Final verification on July 21, 2026:

- frontend: 41 suites, 274 tests passed
- backend: 29 suites, 583 tests passed
- frontend and backend production builds passed
- frontend TypeScript check and backend lint passed
- modified example JSON fixtures and `git diff --check` passed

## Follow-ups

- Layout/auto-size of containers; collapse/expand.
