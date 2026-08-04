# SpatialDSL Studio: Roadmap, Vision, and Next Steps

This is the high-level map of where the project is going and why. It links the two
detailed trackers:

- Modeling workbench and Sirius parity: `sirius-desktop-parity-roadmap.md`
- Spatial code generation and simulation: `smart-warehouse-codegen-future-work.md`

The MDE lifecycle track (phases 11 to 13) has no separate checkbox tracker; its
phase plans under `plans/` are the source of truth, and
`docs/user-guide/project-lifecycle.md` is the hands-on guide.

The hands-on interop validation guide is `docs/reference/sirius-desktop-interop.md`.

## Why we are building this

SpatialDSL Studio is a web-based Model-Driven Engineering (MDE) platform with two
goals that reinforce each other:

1. **Bring Eclipse Sirius Desktop-style domain-specific modeling to the browser.**
   Sirius is powerful but tied to a heavy Eclipse install and desktop workflow.
   The value of MDE (define a domain language once, then model, validate, and
   generate against it) should be reachable from a browser, shareable, and
   collaborative, without losing interchange with the existing EMF/Sirius
   ecosystem.

2. **Close the loop from abstract models to executable spatial simulations.**
   Most modeling tools stop at diagrams and code stubs. SpatialDSL adds a spatial
   dimension (2D and 3D placement as first-class model data) and generates
   artifacts that actually run: an OpenUSD scene for NVIDIA Isaac Sim, plus an
   external multi-agent controller that drives robots over OPC UA. This turns a
   model into a running digital twin, not just a picture.

The end-to-end thesis: a domain expert defines a language (metamodel), builds a
model, arranges it spatially, and gets both a Sirius-interchangeable specification
and a runnable simulation, from one web tool.

## Where we are today

### Modeling workbench (Sirius-style)

- Metamodels (Ecore-like) with Ecore and XMI import/export.
- Models with XMI import/export, OCL and JavaScript constraints.
- Views (2D and 3D editors) as projections over a model.
- Viewpoints and Representation Descriptions with a full editor UI:
  visible/creatable metaclasses, node, containment-container, and edge mapping
  editors, tool definitions, concrete-syntax notation, and pins/ports.
- Sirius interoperability: `.odesign` viewpoint import/export and `.aird` view
  import/export, both round-tripping within the supported subset and preserving
  GMF layout.
- Sirius `.odesign` conditional styles, composite mapping filters, and
  additional layers are preserved through import/export and can be inspected or
  toggled in the representation editor.
- Executable representation kinds: `diagram` (2D/3D), `table` (configurable,
  sortable, and inline-editable), and `tree` (expandable containment hierarchy).
- Representation-specific create-node, create-edge, delete, and reconnect tools,
  with safe scalar attribute initialization for newly created elements.
- Containment-driven diagram containers with fixed styling, constrained child
  layout, parent/descendant dragging, and nested `.odesign`/`.aird` interchange.
- Representation-aware OCL/JavaScript validation panels with issue navigation
  and markers in both 2D and 3D, plus representation-defined property sections
  for semantic attributes and references.
- Code generation: project-based Handlebars templates with `java`, `python`,
  `json`, `xml`, and `plaintext` content types.

### Project workspaces and MDE lifecycle

- Studio Projects as the workspace, navigation context, and authorization
  boundary, with membership roles (`OWNER`, `DSL_DESIGNER`, `MODELER`,
  `VIEWER`), capability-based route guards, archive/restore, and project-scoped
  URLs for every resource group.
- Versioned artifact graph: immutable, dependency-closed checkpoints with
  canonical per-artifact and root hashes, diffing against another checkpoint or
  the live project, and a hash-confirmed transactional restore that never
  restores membership or sharing.
- Metamodel evolution: stable-ID change classification, breaking-change and
  impact analysis across models, viewpoints, transformations, generators, and
  tests, explicit migration rules, stale-preview rejection, and a recovery
  checkpoint recorded on every applied migration.
- Reproducible headless pipelines: server-side validation, transformation,
  model-test, and generation steps with retained per-step evidence, captured
  source checkpoints, deterministic run hashes, and a CI CLI that exits
  non-zero on failure.

### Spatial code generation and simulation

- Smart Warehouse example: metamodel, model, views, and a control layer
  (WarehouseController, Task, Product) plus placeable assets (StorageRack, Dock).
- Canonical X/Y/base-Z/yaw placement with grounded or adjustable
  representation policies, 3D bounds helpers, and an aerial-inspection sample.
- OpenUSD scene generation for NVIDIA Isaac Sim, with a versioned asset manifest,
  a fit scale mode, reviewed placeholder `warehouse-kit` USD props, and a
  normalized MIT-licensed NVIDIA F1TENTH AMR with collision and optional
  articulation layers.
- Separate generated layout, asset, physics, and composed simulation layers,
  with kinematic, dynamic rigid-body, and differential-drive bridge modes.
- An external multi-agent "brain" (A* global planning plus local collision
  avoidance) that talks to the Isaac Sim bridge over OPC UA, mirroring the Visual
  Components WarehouseMAS node layout (Location/Target/State/HasProduct/BatteryLevel).
- Model-driven Visual Components controller, task, and product configuration
  using the same stable OPC UA node contract as the Isaac Sim target.
- An end-to-end walkthrough for running the sample on an NVIDIA Brev cloud GPU.

## What is missing, and why it matters

### Modeling workbench

| Gap | Why it matters | Notes |
| --- | --- | --- |
| Advanced container layout | Fixed containment-driven containers now work; auto-sizing, collapse/expand, compartments, and non-containment grouping are still missing. | Build on the Phase 3 parent/child projection metadata. |
| Advanced tool operations | Native create/delete/reconnect tools and safe create-time attribute assignment now run. Custom direct-edit behavior and full Sirius action trees are still needed for richer DSL workflows. | Keep expression/service execution constrained and explicit. |
| `.odesign` advanced features | Reused mappings, style customizations, Java services, and complex Sirius expressions remain common in real specs. | Conditional styles, common filters, and additional layers now round-trip; remaining constructs are reported, never silently imported. |
| Validation workflow extensions | View-scoped validation and property panels now support review in 2D/3D; quick fixes, severity filters, and optional live revalidation would shorten correction loops. | Validation currently runs when a view opens and on explicit refresh. |
| Higher-fidelity Ecore/XMI | Opposites, containment nuances, multi-resource sessions, and sidecar representation resources widen interoperability. | |
| Lifecycle UI surface | Checkpoints, evolution previews, and pipeline runs are reachable through REST, the typed client service, and the CLI, but have no dedicated panel in the web UI. | The contracts are stable, so a panel is presentation work rather than new backend capability. |
| Branching and merge | Checkpoints are linear per project; there is no branch, fork, or three-way merge of an artifact graph. | The canonical hashing and diff primitives are the foundation this would build on. |
| Cross-project artifact reuse | Every artifact belongs to exactly one project, so a shared library metamodel must be copied rather than referenced. | Deliberate: the one-project invariant is what makes scoping and restore predictable. |

### Spatial simulation

| Gap | Why it matters | Notes |
| --- | --- | --- |
| Broader production USD library | One licensed, normalized AMR is now included; conveyors, stations, racks, and docks still use reviewed placeholders. | Keep provenance and redistribution terms per asset. |
| Physics runtime fidelity | PhysicsScene, colliders, rigid bodies, mass, dynamic control, and optional articulation are generated; contact tuning and RTX runtime validation remain. | The kinematic mode remains available for deterministic navigation. |
| Aerial runtime dynamics | Elevated placement and kinematic drone output are implemented, but autonomous flight, pitch/roll, sensors, and 3D planning are not. | Keep these in a later aerial-runtime phase rather than overloading the ground robot contract. |
| Real robot runtime validation | The production AMR has joint mappings and a differential-drive articulation layer. | Validate its physical behavior in Isaac Sim on supported NVIDIA hardware. |
| Isaac Sim QA loop | Verified runs on real hardware/cloud with screenshots, checksums, and version records. | Manual QA the team runs; not automatable here. |
| Visual Components runtime parity | Generated JADE configuration now consumes Controller/Task/Product entities and shares the OPC UA contract. | Load it against a supported Visual Components/WarehouseMAS installation. |

## Suggested sequencing

Near term (finishes partially-built features):

1. **Tree representations and richer tables, completed July 21, 2026.** Tree
   views render expandable containment hierarchies; table representations support
   configured columns, type-aware inline edits, and sorting.
2. **Tool execution, completed July 21, 2026.** Authored create-node and
   create-edge tools run from the palette; delete and target-reconnect tools run
   in the 2D editor; create-node tools support safe scalar attribute operations.
3. **Container mappings, completed July 21, 2026.** Added the data-model
   concept, editor, nested projection/rendering, and `.odesign`/`.aird`
   round-trip.

Medium term (widens interoperability and review workflows):

4. **Representation-aware validation display and property panels, completed
   July 21, 2026.** Added view-scoped issue panels and navigation, 2D/3D markers,
   representation property-section authoring, and attribute/reference editors.
5. **`.odesign` conditional styles, layers, and filters, completed July 21,
   2026.** Added typed preservation, composite-filter parsing, layer mappings,
   editor toggles, and export round-trips.
6. **Full Sirius project ZIP export, completed July 21, 2026.** Bundles
   `.project`, `.ecore`, `.xmi`, `.odesign`, and `.aird` with consistent
   references; the real Eclipse open remains an external release smoke test.

Spatial track (can run in parallel):

7. **Production AMR asset, completed July 21, 2026.** Added licensed,
   provenance-tracked visual, collision, and articulation layers plus recursive
   manifest validation; Isaac Sim render/play QA remains an external release gate.
8. **PhysX physics and layered USD, completed July 21, 2026.** Added four
   generated layers and kinematic, dynamic, and articulation runtime modes;
   Isaac Sim physical-behavior QA remains an external release gate.
9. **Visual Components MAS wiring, completed July 21, 2026.** Controller,
   task, product, and stable OPC UA data are model-driven; a live Visual
   Components/WarehouseMAS load remains an external release gate.
10. **Elevation and aerial placement, implementation and
    [automated QA](docs/qa/phase-10-elevation-and-aerial-placement-2026-07-22.md)
    completed July 22, 2026.** Added backward-compatible base-elevation Z,
    representation-controlled grounded/adjustable authoring, an
    inspection-drone sample, Sirius presentation sidecar, and matching
    OpenUSD/Isaac Sim kinematic output. Flight dynamics and 3D navigation remain
    later work; the Isaac Sim Play check is an external release gate.

MDE lifecycle track (builds on project-scoped workspaces):

11. **Versioned artifact graph, completed August 3, 2026.** A project is now a
    versionable graph rather than a bag of latest-state records. Checkpoints are
    immutable, dependency-closed, and canonically hashed, so two project states
    can be proven identical, compared, and restored.
12. **Metamodel evolution and co-evolution, completed August 3, 2026.**
    Metamodel edits are explicit language-evolution operations: preview the
    classified changes and their blast radius, clear blockers with explicit
    migration rules, then apply transactionally behind an automatic recovery
    checkpoint.
13. **Reproducible headless MDE pipelines, completed August 3, 2026.**
    Validation, transformations, model tests, and generation run server-side
    against a captured checkpoint, with retained step evidence, a deterministic
    run hash, and a CLI that fails a CI job on a failing run.

## Phase plans

Each sequencing item above has a per-phase plan under [`plans/`](plans/README.md),
with scope, a task checklist, and verification. The plans index is the status
dashboard; keep this narrative and those plans in sync.

Workbench track:

1. [x] [Tree representations and richer tables](plans/phase-01-tree-and-table.md)
   (completed July 21, 2026)
2. [x] [Tool execution and operation language](plans/phase-02-tool-execution.md)
   (completed July 21, 2026)
3. [x] [Container mappings](plans/phase-03-container-mappings.md)
   (completed July 21, 2026)
4. [x] [Validation and property panels](plans/phase-04-validation-and-properties.md)
   (completed July 21, 2026)
5. [x] [.odesign advanced features](plans/phase-05-odesign-advanced.md)
   (completed July 21, 2026)
6. [x] [Full Sirius project bundle export](plans/phase-06-sirius-project-bundle.md)
   (completed July 21, 2026)

Spatial track (parallel):

7. [x] [Production AMR asset and Isaac Sim QA](plans/phase-07-production-asset-qa.md)
   (implementation and automated QA completed July 21, 2026)
8. [x] [PhysX physics and layered USD](plans/phase-08-physx-and-layered-usd.md)
   (implementation and automated QA completed July 21, 2026)
9. [x] [Visual Components MAS wiring](plans/phase-09-visual-components-mas.md)
   (implementation and automated QA completed July 21, 2026)
10. [x] [Elevation and aerial placement](plans/phase-10-elevation-and-aerial-placement.md)
    (implementation and automated QA completed July 22, 2026)

MDE lifecycle track:

11. [x] [Versioned artifact graph](plans/phase-11-versioned-artifact-graph.md)
    (implementation and automated QA completed August 3, 2026)
12. [x] [Metamodel evolution and co-evolution](plans/phase-12-metamodel-coevolution.md)
    (implementation and automated QA completed August 3, 2026)
13. [x] [Reproducible headless MDE pipelines](plans/phase-13-headless-mde-pipelines.md)
    (implementation and automated QA completed August 3, 2026)

Roadmap phases 1 to 13 and their repository-verifiable checks are complete.
Unchecked Eclipse Sirius, Isaac Sim, and Visual Components
runtime checks in completed phase plans are platform release gates, not
incomplete code.

## How to decide what is next

- Phases 1 to 13 are implemented and pass the repository verification matrix.
- External release gates still require machines with Eclipse Sirius Desktop,
  NVIDIA Isaac Sim, and Visual Components/WarehouseMAS.
- The lifecycle capabilities have no web UI yet. A checkpoint/evolution/pipeline
  panel over the existing contracts is the cheapest next increment; branching
  and cross-project reuse are the larger open questions.
- The interop guide (`docs/reference/sirius-desktop-interop.md`) is the way to
  smoke-test the bundle against real Eclipse Sirius Desktop; the Brev walkthrough
  validates the spatial output against real Isaac Sim.

Keep the two detailed trackers (`sirius-desktop-parity-roadmap.md`,
`smart-warehouse-codegen-future-work.md`) as the checkbox source of truth; this
file is the narrative that explains the order and the reasons.
