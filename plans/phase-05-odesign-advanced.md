# Phase 5: .odesign Advanced Features

- Track: Workbench
- Status: Completed July 21, 2026
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (medium term, item 5)
- Tracker: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md) (Area 2)
- Reference: [docs/reference/sirius-file-compatibility.md](../docs/reference/sirius-file-compatibility.md)

## Goal

Import (then export) the common Sirius `.odesign` features that are currently
reported and dropped: conditional styles, layers, and filters.

## Why

Real-world Sirius viewpoint specs lean heavily on conditional styles (style by
predicate), additional layers, and filters. Today these are surfaced in the
compatibility report and skipped. Supporting them widens the set of real Sirius
projects that round-trip, which is the whole point of the interop story.

## Scope

In:
- Import fidelity first: parse conditional styles, additional layers, and filters
  into representation-description model concepts.
- Editor support to view/toggle them.
- Export back to `.odesign`.

Out (later):
- Java service extensions; reused mappings; quick fixes and validation sets.

## Tasks

- [x] Model concepts for conditional styles, layers, and filters on the representation description.
- [x] Parse them in `parseOdesign` (replace the current drop-with-warning path).
- [x] Minimal editor UI to inspect and toggle layers/filters/conditional styles.
- [x] Emit them in `buildOdesignXml`.
- [x] Tests: a fixture with conditional styles + a layer + a filter round-trips.

## Verification

- Backend round-trip test for the new features.
- Import a real (small) Sirius `.odesign` that uses a conditional style and confirm
  it is preserved, per the parity guide.

Completed with the backend `SiriusInteropService` round-trip test using the
official Sirius XML shapes for `CompositeFilterDescription`, `MappingFilter`,
`conditionnalStyles`, and `additionalLayers`. The representation-editor test
also verifies all three feature toggles persist.

## Follow-ups

- Apply conditional styles at render time in the view editor.
