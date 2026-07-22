# Phase 6: Full Sirius Project Bundle Export

- Track: Workbench
- Status: Completed July 21, 2026 (external Eclipse smoke test pending)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (medium term, item 6)
- Tracker: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md) (Area 5)
- Reference: [docs/reference/sirius-desktop-interop.md](../docs/reference/sirius-desktop-interop.md)
- Depends on: `.aird` export (PR #34), `.odesign` export

## Goal

Export a single ZIP that Eclipse Sirius Desktop can open directly, bundling all
four artifacts with consistent cross-references.

## Why

Today the individual exporters (`.ecore`, `.xmi`, `.odesign`, `.aird`) exist, but
the project ZIP export still defers `.aird` and omits the semantic `.xmi`. A
one-click, openable Sirius project is the true "close the loop" for interop: import
a Sirius project, edit in SpatialDSL, export a Sirius project.

## Scope

In:
- Bundle `.ecore` + `.xmi` + `.odesign` + `.aird` into one ZIP with a Sirius
  modeling-project layout and matching relative paths.
- Ensure `.aird` `semanticResources` and target refs point at the bundled `.xmi`,
  and `.odesign` domain classes match the bundled `.ecore`.
- Replace the `SIRIUS_DEFERRED_AIRD_EXPORT` warning with real inclusion.

Out (later):
- Multi-model/multi-viewpoint bundles beyond the primary set.

## Tasks

- [x] Backend: assemble the four artifacts with consistent references in `sirius-interop.service`.
- [x] Frontend: update `exportProjectZip` to include `.xmi` and `.aird`.
- [x] Remove the deferred-aird warning path.
- [x] Tests: ZIP contains the four artifacts; cross-references are consistent.
- [ ] Manual: open the exported ZIP in Eclipse Sirius Desktop (parity guide).

## Verification

- [x] Automated tests assert the ZIP entries and that `.aird` references resolve
  to the bundled `.xmi` and `.odesign`.
- [x] Full backend and frontend regression suites and production builds pass.
- [ ] Manual Sirius Desktop open per `docs/reference/sirius-desktop-interop.md`.

Automated evidence is recorded in
[`docs/qa/roadmap-phases-06-09-2026-07-21.md`](../docs/qa/roadmap-phases-06-09-2026-07-21.md).

## Follow-ups

- Round-trip the exact bundle back through import as a regression.
