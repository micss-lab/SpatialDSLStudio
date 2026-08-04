# Phase 1: Tree Representations and Richer Tables

- Track: Workbench
- Status: Complete (July 21, 2026)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (near term, item 1)
- Tracker: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md) (Area 4)
- Depends on: shipped table representation (PR #38)

## Goal

Complete the diagram/table/tree representation trio and make tables useful, not
just readable.

## Why

Before this phase, `RepresentationKind` already allowed `tree`, while tables were
read-only. Trees are the natural view for containment-heavy models, and editable
tables turn the table view into a real working surface. Finishing this closes the
"executable representations" story.

## Scope

In:
- Enable the `tree` kind in the representation editor and Create View.
- A `TreeView` component that renders the model as a containment hierarchy
  (root elements, expandable by containment references), restricted to visible
  metaclasses.
- Table column selection: add an optional `tableColumns` field to the
  representation description and let the editor choose which attributes are shown.
- Inline table editing: write attribute edits back to the model element style.
- Basic sorting on table columns.

Out (later):
- Custom tree/table cell renderers, grouping, and computed columns.

## Tasks

- [x] Un-disable the `tree` MenuItem in `ViewpointManager` kind selector.
- [x] Add `tree` to the Create View filter in `App.tsx` (`selectableRepresentationDescriptions`).
- [x] Create `frontend/src/components/diagram/TreeView.tsx` (containment hierarchy).
- [x] Branch `DiagramEditorPage` to render `TreeView` when kind is `tree`.
- [x] Add `tableColumns?: string[]` to `RepresentationDescription` (shared + frontend types) and a column picker in the representation editor.
- [x] Make `TableView` honor `tableColumns` and support inline edit + sort.
- [x] Tests: `TreeView` render test; table column-selection and inline-edit tests.
- [x] Add importable Smart Warehouse table/tree definitions and saved example Views.

## Verification

- `TreeView` and updated `TableView` unit tests pass.
- Create a `tree` and an edited `table` view against the Smart Warehouse model and
  confirm they open and edit correctly.

Completed verification:

- Full frontend suite: 38 suites, 258 tests passed.
- Full backend suite: 29 suites, 581 tests passed.
- Frontend and backend production builds pass.
- Fixture-backed Smart Warehouse tests open a visible-metaclass tree and persist a
  typed inline table edit through the semantic model service.
- The Smart Warehouse fixture exposes diagram, table, and tree descriptions from
  one viewpoint and includes saved Views for each kind.
- Backend tests confirm tree views persist through the compatibility view API and
  remain protected from diagram-only mutation endpoints.

## Follow-ups

- `tableColumns` has no mapping in the supported `.odesign` subset and is documented
  as SpatialDSL-internal metadata in `docs/user-guide/viewpoints.md`.
