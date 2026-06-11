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

In progress / planned:

- richer example coverage and walkthrough documentation
- broader workflow tests and docs

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
- [ ] `.odesign` export
- [ ] `.odesign` import

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
- [ ] node mapping editor
- [ ] container mapping editor
- [ ] edge mapping editor
- [ ] conditional styles
- [ ] layers
- [ ] filters

### 3. Tools And Operations

Sirius supports creation tools, delete tools, direct edit tools, reconnect tools, and model operations.

SpatialDSL target:

- palette/tool definitions inside representation descriptions
- creation tools for metaclasses and references
- pin creation tools
- later model operation/action language

Tracker:

- [x] basic create model element in view
- [x] basic add existing model element to view
- [ ] representation-specific tool editor
- [ ] create node tool definitions
- [ ] create edge tool definitions
- [ ] delete tools
- [ ] direct edit tools
- [ ] reconnect tools
- [ ] model operation language

### 4. Table And Tree Representations

Sirius supports diagram, table, and tree representations.

SpatialDSL target:

- diagram executable first
- table/tree reserved in contracts
- later executable web editors

Tracker:

- [x] `RepresentationKind = 'diagram' | 'table' | 'tree'`
- [ ] table representation editor
- [ ] tree representation editor
- [ ] Create View support for executable table/tree when implemented

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
- [ ] sidecar representation export
- [ ] explicit warnings for SpatialDSL-specific presentation data
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
- later bind validation visibility/actions into representations
- representation-specific property panels

Tracker:

- [x] OCL/JS validation foundations
- [ ] representation-aware validation display
- [ ] quick fixes
- [ ] representation-specific property sections
- [ ] viewpoint-defined property panels

## Immediate Roadmap

The completed phases 3-5 are a Sirius-style web specifier slice, not full Sirius Desktop parity. The next concrete work is:

1. Phase 6 example data polish and walkthroughs
2. Phase 7 broader tests around full user workflows
3. Phase 8 screenshots and documentation

After those are done, revisit this roadmap and choose the next parity area:

- table/tree representations
- `.odesign` import/export
- diagram mapping editor
- tool operation language

## Current Interoperability Position

SpatialDSL supports partial semantic interchange with EMF tooling through Ecore metamodel import/export and XMI model import/export. It does not currently import/export Sirius `.odesign` viewpoint specifications or `.aird` representation/session files.

## References

- Eclipse Sirius documentation: https://eclipse.dev/sirius/doc/
- Sirius specifier documentation: https://eclipse.dev/sirius/doc/specifier/general/Specifying_Viewpoints.html
- Sirius diagram specifier documentation: https://eclipse.dev/sirius/doc/specifier/diagrams/Diagrams.html
