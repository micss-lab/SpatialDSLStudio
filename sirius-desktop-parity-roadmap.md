# Sirius Desktop Parity Roadmap

## Purpose

Track the gap between SpatialDSL Studio and Eclipse Sirius Desktop.

This is a roadmap tracker, not the immediate implementation plan. The immediate implementation plan for Viewpoints phases 3-5 is:

- `viewpoints-phases-3-5-implementation-plan.md`

The current Viewpoints completion plan is:

- `viewpoints-ui-completion-plan.md`

## Product Target

SpatialDSL should first become a Sirius-style web specifier experience:

- metamodels define semantic languages
- viewpoints define modeling perspectives
- representation descriptions define diagram/table/tree specifications
- views are concrete saved representation instances
- `/api/diagrams` remains the compatibility endpoint for current view resources

Full Sirius Desktop parity is a larger roadmap and should be implemented incrementally.

## Current Status

Implemented foundation:

- Ecore-like metamodel contracts
- XMI-oriented model import/export foundations
- model-backed views
- Viewpoint and Representation Description contracts
- backend viewpoint service/routes
- diagram links to viewpoint/representation description
- default viewpoint generation and migration support
- diagram projection filtering
- representation-specific notation resolution
- Create View viewpoint/representation selection
- View card and editor header context
- Viewpoint management UI
- Representation Description editor
- pin creation, drag, validation, and edge anchoring support
- `.odesign` viewpoint import/export subset
- `.aird` view import subset (resolves against an imported model/viewpoint, preserves GMF layout)
- `.aird` view export subset (serializes SpatialDSL views back to a Sirius session with GMF layout; round-trips with import)
- single-model Sirius project ZIP export (`.project`, `.ecore`, `.xmi`,
  `.odesign`, and `.aird`) with consistent relative references
- executable tree representations over containment references
- configurable, sortable, inline-editable table representations
- executable create-node, create-edge, delete, and target-reconnect tools
- safe create-node `set-attribute` operations
- containment-driven container mapping contracts and editor
- nested container projection/rendering with constrained child layout
- `.odesign` container mapping and nested `.aird` GMF round-trips
- view-scoped OCL/JavaScript validation panels with navigation and 2D/3D markers
- representation-specific attribute/reference property sections and editors
- `.odesign` conditional styles, composite filters, and additional layers with
  typed import/export preservation and editor toggles

In progress / planned:

- richer example coverage and walkthrough documentation
- broader workflow tests and docs
- advanced tool/direct-edit operations
- validation quick fixes, severity filtering, and optional live revalidation

## Parity Areas

### 1. Viewpoint Specification Model

Sirius Desktop has `.odesign` Viewpoint Specification Models.

SpatialDSL target:

- internal JSON-backed Viewpoint specification
- later import/export bridge for `.odesign`

Tracker:

- [x] Viewpoint contract
- [x] Representation Description contract
- [x] embedded representation descriptions
- [x] Viewpoint management UI
- [x] Representation Description editor
- [x] `.odesign` export
- [x] `.odesign` import

### 2. Diagram Representation Descriptions

Sirius supports rich diagram mappings and styles.

SpatialDSL target:

- visible metaclasses
- creatable metaclasses
- concrete syntax overrides
- edge mappings
- pin mappings
- tool definitions

Tracker:

- [x] visible metaclass filtering
- [x] creatable metaclass filtering
- [x] metaclass notation override contract
- [x] reference notation override contract
- [x] node mapping editor
- [x] container mapping editor
- [x] edge mapping editor
- [x] conditional styles
- [x] layers
- [x] filters

### 3. Tools And Operations

Sirius supports creation tools, delete tools, direct edit tools, reconnect tools, and model operations.

SpatialDSL target:

- palette/tool definitions inside representation descriptions
- creation tools for metaclasses and references
- pin creation tools
- a safe incremental model-operation language

Tracker:

- [x] basic create model element in view
- [x] basic add existing model element to view
- [x] representation-specific tool editor
- [x] create node tool definitions
- [x] create edge tool definitions
- [x] delete tool definitions
- [x] direct edit tool definitions
- [x] reconnect tool definitions
- [x] create-node and create-edge execution in the palette/editor
- [x] semantic delete and target-reconnect execution in the 2D editor
- [x] minimal create-node `set-attribute` operation payload
- [ ] custom direct-edit execution
- [ ] full Sirius model-operation trees and expression/service execution

### 4. Table And Tree Representations

Sirius supports diagram, table, and tree representations.

SpatialDSL target:

- executable diagram, table, and tree web editors
- configurable table attributes with semantic inline editing
- containment-derived expandable tree navigation

Tracker:

- [x] `RepresentationKind = 'diagram' | 'table' | 'tree'`
- [x] table representation (executable, configurable, sortable, inline-editable)
- [x] tree representation editor
- [x] Create View support for executable table and tree representations
- [x] table column selection
- [x] inline semantic attribute editing
- [x] basic table sorting

### 5. Semantic EMF/Ecore/XMI Fidelity

Sirius works over EMF semantic resources.

SpatialDSL target:

- preserve metamodel semantics in Ecore import/export
- preserve model semantics in XMI import/export
- keep viewpoint/view metadata separate from semantic XMI unless explicit sidecar export exists

Tracker:

- [x] Ecore-oriented metamodel model
- [x] XMI-oriented model services foundation
- [ ] multi-resource model sessions
- [x] sidecar representation export (`.aird` session/representation export with GMF layout)
- [x] single-model Sirius project bundle (`.ecore` + `.xmi` + `.odesign` + `.aird`)
- [x] explicit warnings for SpatialDSL-specific presentation data
- [ ] higher-fidelity Ecore constraints/opposites/containment handling

### 6. Pins, Ports, And Advanced Anchors

Sirius diagrams can express richer edge endpoints through mappings/tools.

SpatialDSL target:

- semantic pins as model elements
- pin mappings in representation descriptions
- attached pin rendering
- edge anchoring to pin centers

Tracker:

- [x] pin mapping contract
- [x] attached presentation fields
- [x] attached projection positioning
- [x] pin creation UX
- [x] pin owner validation
- [x] drag pin along owner boundary
- [x] edge anchoring to pin center
- [x] semantic UML Activity pin example

### 7. Validation, Quick Fixes, And Properties

Sirius integrates validation, properties views, and tooling.

SpatialDSL target:

- keep current OCL/JS validation
- bind validation visibility/actions into representations
- representation-specific property panels

Tracker:

- [x] OCL/JS validation foundations
- [x] representation-aware validation display
- [ ] quick fixes
- [x] representation-specific property sections
- [x] viewpoint-defined property panels

## Immediate Roadmap

Roadmap Phases 1–6—tree/table representations, native tool execution, container
mappings, validation/property panels, advanced `.odesign` preservation, and the
full Sirius project bundle—were implemented and passed automated verification on
July 21, 2026. The next parity work is validation quick fixes, richer workflow
controls, direct-edit operations, and broader multi-resource support. Opening an
exported bundle in a real Eclipse Sirius installation remains a release smoke
test rather than an implementation task.

## Current Interoperability Position

SpatialDSL supports partial semantic interchange with EMF tooling through Ecore metamodel import/export and XMI model import/export. It imports and exports a Sirius `.odesign` viewpoint-specification subset, and both imports and exports a Sirius `.aird` view subset (diagram representations resolved against an already-imported model and viewpoint, with GMF notation layout preserved). Export round-trips with import: an exported `.aird` re-imports to the same nodes, edges, and layout.

## References

- Eclipse Sirius documentation: https://eclipse.dev/sirius/doc/
- Sirius specifier documentation: https://eclipse.dev/sirius/doc/specifier/general/Specifying_Viewpoints.html
- Sirius diagram specifier documentation: https://eclipse.dev/sirius/doc/specifier/diagrams/Diagrams.html
