# Sirius Desktop Interoperability and Parity Check

How to set up an Eclipse Sirius Desktop project and validate that SpatialDSL
Studio round-trips with it. Use this to confirm an exported SpatialDSL project
opens in Sirius Desktop, and that a Sirius Desktop project imports back into
SpatialDSL, within the supported subset.

For the exact per-element contract and known gaps, see
[Sirius File Compatibility](sirius-file-compatibility.md). This page is the
hands-on workflow.

## The four artifacts and how they relate

A Sirius diagram is spread across four files. SpatialDSL imports and exports each
one:

| File | Sirius role | SpatialDSL concept | Import UI | Export UI |
| --- | --- | --- | --- | --- |
| `.ecore` | domain metamodel (EMF) | Metamodel | Metamodels page | Metamodels page |
| `.xmi` | semantic model (instances) | Model | Models page | Models page |
| `.odesign` | Viewpoint Specification Model (diagram mappings/styles) | Viewpoint + Representation Descriptions | Viewpoint manager | Viewpoint manager |
| `.aird` | representations/session (diagrams + GMF layout) | Views | Viewpoint manager (`Import .aird View`) | Viewpoint manager (`Export .aird View`) |

Reference chain: `.aird` -> `.odesign` (viewpoint/description) and `.aird` -> `.xmi`
(semantic targets) and `.xmi` -> `.ecore` (conformance) and `.odesign` -> `.ecore`
(domain classes). Order matters on import: metamodel, then model, then viewpoint,
then views.

## Prerequisites: install Sirius Desktop

1. Install Eclipse Modeling Tools (or any Eclipse IDE with EMF).
2. Install Sirius from the official update site via `Help > Install New Software`,
   using the current Sirius update site listed at
   https://eclipse.dev/sirius/download.html.
3. Restart Eclipse.

Sirius versions move; follow the official install guide for your Eclipse
release: https://eclipse.dev/sirius/doc/.

## Direction A: SpatialDSL Studio -> Sirius Desktop

Goal: take a model built in SpatialDSL and open its diagram in Sirius Desktop.

The preferred path is Viewpoint manager -> `Export Zip`. SpatialDSL chooses the
primary model and produces an Eclipse modeling project containing `.project`,
`model/<metamodel>.ecore`, `model/<model>.xmi`,
`description/<metamodel>.odesign`, `representations.aird`, and the compatibility
report. Extract the ZIP, then use `File > Import > Existing Projects into
Workspace` in Eclipse and select the extracted directory.

The individual-file workflow remains useful for diagnosis:

1. **Export the metamodel.** Metamodels page -> select the metamodel ->
   export `.ecore`.
2. **Export the model.** Models page -> select the model -> export `.xmi`.
3. **Export the viewpoint.** Viewpoint manager (for the metamodel) ->
   `Export .odesign`.
4. **Export the views.** Viewpoint manager -> `Export .aird View`. This writes a
   `.aird` session whose representations reference the `.odesign` description and
   the `.xmi` elements, with GMF node bounds and edge waypoints preserved.
5. **Assemble the Sirius project.** In Eclipse (only when using individual exports):
   - Create a Viewpoint Specification Project and drop in the `.odesign` (or open
     it directly).
   - Create a Modeling Project and copy in the `.ecore`, `.xmi`, and `.aird`.
   - Fix up relative resource paths if needed. The one-click project ZIP avoids
     this step by emitting matching `model/...` and `description/...` references.
6. **Open the representation.** Enable the viewpoint on the modeling project
   (`Viewpoints Selection`), then open the diagram from the `.aird`. Confirm the
   nodes, edges, and layout match what SpatialDSL showed.

## Direction B: Sirius Desktop -> SpatialDSL Studio

Goal: take a project authored in Sirius Desktop and continue it in SpatialDSL.

1. In Sirius Desktop, build a Viewpoint Specification (`.odesign`) with one
   diagram description, a Modeling Project with an `.ecore` + `.xmi`, and a
   representation (diagram) saved into `representations.aird`.
2. **Import the metamodel.** Metamodels page -> import the `.ecore`.
3. **Import the model.** Models page -> import the `.xmi` (it must conform to the
   imported metamodel).
4. **Import the viewpoint.** Viewpoint manager -> `Import Sirius` -> the
   `.odesign`.
5. **Import the views.** Viewpoint manager -> select the imported viewpoint ->
   `Import .aird View` -> the `.aird`. Each `DSemanticDiagram` becomes a
   SpatialDSL view; semantic targets resolve against the imported model and the
   GMF layout is preserved.

If a step reports unresolved references, the in-app compatibility report names
each dropped element and why.

## Parity checklist

Run both directions on the same tiny example and confirm each row. The synthetic
fixture in `fixtures/sirius/aird-layout/` is a minimal reference (one diagram,
two nodes, one edge).

| Check | Expected |
| --- | --- |
| `.ecore` round-trip | Classes, attributes, references, containment, inheritance, enums preserved. |
| `.xmi` round-trip | Elements, attribute values, references, `xmi:id`s preserved. |
| `.odesign` round-trip | Viewpoint + diagram description, visible/creatable metaclasses, node/edge notation, pin and tool entries preserved (within the supported subset). |
| `.aird` round-trip | One view per `DSemanticDiagram`; nodes resolve to model elements; edges keep source/target; node bounds and edge waypoints preserved. |
| SpatialDSL -> Sirius -> open | Diagram opens in Sirius Desktop with matching layout. |
| Sirius -> SpatialDSL -> view | View opens in SpatialDSL with matching layout. |
| SpatialDSL -> export `.aird` -> re-import | Same nodes, edges, and layout (in-app round-trip; covered by automated tests). |
| SpatialDSL -> export project ZIP | ZIP contains all four resources; every `.aird` semantic/viewpoint/description reference resolves within the bundle. |

## Known gaps (expected to not round-trip yet)

These are reported, never silently dropped. Track them in
`sirius-desktop-parity-roadmap.md`:

- `.odesign` reused mappings, style customizations, Java services, and complex
  expression execution. Conditional styles, common filters, and additional
  layers are preserved by the supported import/export subset.
- Container nesting, tool operations, and model operation language.
- Table and tree representations.
- Multi-resource sessions and lazy `.srm` representation files.

When a parity check fails on something outside this list, capture the input
files and the in-app compatibility report and file it against the roadmap.
