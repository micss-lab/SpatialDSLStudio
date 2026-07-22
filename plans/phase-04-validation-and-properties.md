# Phase 4: Validation and Property Panels

- Track: Workbench
- Status: Completed July 21, 2026
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (medium term, item 4)
- Tracker: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md) (Area 7)

## Goal

Surface OCL/JavaScript validation inside views, and give representations
configurable property panels.

## Why

Validation already runs, but results are not shown where a modeler works. A real
review workflow needs validation markers on the view, optional quick fixes, and
representation-specific property sections. This is what makes the workbench usable
for actual modeling, not just specification.

## Scope

In:
- Representation-aware validation display: run OCL/JS constraints for the view's
  model and mark offending elements in the 2D/3D editors.
- A validation panel listing issues with navigation to the element.
- Viewpoint-defined property sections: which attributes/references appear in the
  properties panel per representation.

Out (later):
- Automated quick-fix actions beyond simple attribute set; live re-validation on
  every keystroke.

## Tasks

- [x] Run constraint validation for the view's model and expose results to the editor.
- [x] Render validation markers on nodes/edges and a per-view issues panel.
- [x] Add representation-level property-section config to the representation description.
- [x] Honor the property-section config in the element properties panel.
- [x] Tests: validation surfaces an OCL failure on a view; property panel respects config.

## Verification

- A deliberately invalid Smart Warehouse element shows a marker and appears in the
  issues panel.
- The properties panel shows only the configured sections for a representation.

Verified with the Smart Warehouse `Fleet and Charging` representation: the
second mobile robot has a deliberate low-battery JavaScript constraint failure,
and the representation defines separate robot/station property sections. Focused
tests cover view filtering/navigation, issue-panel actions, the sample constraint,
property rendering/reference editing, JSON normalization, and authoring UI.

## Follow-ups

- Quick fixes; severity filtering; validation on demand vs live.
