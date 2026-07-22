# Sirius File Compatibility

This page defines the Phase 0 file compatibility contract for future Sirius
Desktop project interchange. It is a specification and fixture guide, not a
claim that all listed Sirius formats are implemented today.

SpatialDSL Studio currently supports partial semantic interchange through
Ecore metamodel files and EMF-style XMI model files. The backend Sirius
interoperability API also supports an initial `.odesign` validate/import/export
subset for diagram Viewpoint Specification Models, plus an initial `.aird`
view import/export subset that round-trips Sirius diagram representations and
SpatialDSL views.

## Source Concepts

Sirius Desktop stores project data across separate EMF resources:

- semantic resources: the user model data, normally `.xmi` files conforming to
  one or more Ecore metamodels
- viewpoint specification resources: `.odesign` files containing Viewpoints and
  Representation Descriptions
- representation resources: `.aird` files containing session and representation
  data
- optional lazy representation resources: `.representation/*.srm` files used
  when Sirius stores representations outside the main `.aird`

References:

- https://eclipse.dev/sirius/doc/specifier/general/Specifying_Viewpoints.html
- https://eclipse.dev/sirius/doc/specifier/diagrams/Diagrams.html
- https://eclipse.dev/sirius/doc/developer/Architecture.html
- https://eclipse.dev/sirius/doc/developer/Meta-models.html
- https://eclipse.dev/sirius/doc/developer/representations_lazy_loading.html

## Compatibility Levels

| Level | Meaning |
|---|---|
| Supported | Parsed or emitted with no intentional data loss inside the documented subset. |
| Lossy | Accepted, but the compatibility report must identify dropped or approximated data. |
| Unsupported | Rejected or skipped with an explicit report entry. No silent data loss is allowed. |
| Deferred | Valid Sirius concept, but not part of the first file compatibility implementation. |

## Project Bundle Layout

The first project-level import/export target uses this layout:

```text
project/
  description/*.odesign
  model/*.ecore
  model/*.xmi
  representations.aird
```

Lazy Sirius representation files are recognized as a future extension:

```text
project/
  .representation/*.srm
```

Importers must reject unsafe paths, including absolute paths and `../`
segments. Exporters must generate stable relative paths.

## Format Matrix

| Format | Phase 0 Target | Required Behavior |
|---|---|---|
| `.ecore` | Supported subset | Import and export single-package Ecore metamodels with named classes, attributes, references, containment, inheritance, enums, `nsURI`, and `nsPrefix`. Report unsupported annotations, custom datatype details, unresolved references, and cross-package references. |
| `.xmi` | Supported subset | Import and export semantic model resources against a matching metamodel. Preserve stable `xmi:id` values when present. Report unresolved non-containment references and any presentation data found in semantic resources. |
| `.odesign` | Supported subset | Import and export one or more Viewpoints with diagram Representation Descriptions using the subset below. Report unsupported Sirius specifier features. |
| `.aird` | Supported import/export subset | Import diagram representations as SpatialDSL views, resolving semantic targets and viewpoint/representation references against an already-imported model and viewpoint, and preserving GMF notation layout. Export serializes a model's views back into a Sirius session with GMF layout, round-tripping with import. See the `.aird` subsets below. |
| `.representation/*.srm` | Deferred | Detect references to lazy representation resources and report them as deferred or unresolved if the referenced file is missing. |
| project `.zip` | Supported import wrapper and full single-model export | Export includes `.project`, `.ecore`, semantic `.xmi`, `.odesign`, `representations.aird`, and a compatibility report with consistent relative references. Import validates paths before delegating contained resources. |

## `.odesign` Supported Subset

The first `.odesign` implementation should support:

| Sirius Element | SpatialDSL Mapping | Compatibility |
|---|---|---|
| `Group` | import/export bundle metadata | Supported for name and traceability only. |
| `Viewpoint` | Viewpoint | Supported for stable id/name, label, and model file extensions. |
| `DiagramDescription` | Representation Description with `kind = diagram` | Supported for name, label, domain class, and default layer contents. |
| Default layer | Representation mapping container | Supported. |
| Additional layers | `layers` plus retained layer mappings | Supported for common node, container, bordered-node, and edge mappings, including label, optionality, and active-by-default state. |
| Node mapping | visible/creatable metaclass plus notation override | Supported when the domain class resolves and candidate expression is simple. |
| Container mapping | `containerMappings` entry plus container notation | Supported when the container class, direct containment reference, and nested subnode domain classes resolve. |
| Bordered node mapping | semantic pin or attached node mapping | Supported for simple domain-class mappings attached to owner nodes. |
| Relation-based edge mapping | reference edge mapping | Supported when source/target mappings resolve and target finder is a direct reference expression. |
| Element-based edge mapping | none | Lossy or unsupported unless it can be represented as a direct reference edge. |
| Basic node/container/edge style | concrete syntax override | Supported for shape, fill color, border color, line style, label expression, and edge arrows where representable. |
| Conditional node/container/edge style | `conditionalStyles` on the representation description | Supported for ordered predicate/style preservation and export. Predicates are retained but not executed by the SpatialDSL renderer. |
| Composite mapping filter | `filters` and mapping/variable rules | Supported for name, filter kind, mapping references, and semantic/view condition preservation. Filters can be toggled in the representation editor but expressions are not executed. |
| Basic create tool | representation-specific creation affordance | Supported only for simple create-instance behavior. |

Simple expressions are limited to direct feature access such as
`feature:name`, `feature:children`, or `aql:self.children`. Any expression that
requires Java services, complex AQL/OCL evaluation, multi-step operation chains,
or runtime interpreter state is unsupported in the first implementation.

## `.aird` Supported Import Subset

`.aird` import requires the semantic model and viewpoint to be imported into
SpatialDSL first; it resolves the session's references against them rather than
auto-creating new resources. Each Sirius `DSemanticDiagram` becomes one
SpatialDSL view.

| Sirius Element | SpatialDSL Mapping | Compatibility |
|---|---|---|
| `DAnalysis` | session container | Recognized for traceability; `semanticResources` are informational. |
| `DView` (`ownedViews`) | viewpoint context | The target viewpoint is supplied by the caller; the `viewpoint` reference is not re-resolved. |
| `DSemanticDiagram` | View (`Diagram`) | Supported. `name` becomes the view name; `description` resolves to a representation description in the supplied viewpoint. |
| Diagram element `target` | model element (`modelElementId`) | Resolved by `xmi:id` fragment first, then by a unique element name. Unresolved or ambiguous targets are dropped with a report entry. |
| Node element | view node | Supported. |
| Nested GMF node | node `parentId` plus world-space bounds | Supported. The nearest GMF parent node becomes the visual container; relative nested bounds are accumulated during import. |
| Edge element (`sourceNode`/`targetNode`, or edge mapping) | view edge | Supported when both endpoints resolve to imported nodes; otherwise dropped with a report entry. |
| GMF `notation:Node` `Bounds` | node `x`/`y`/`width`/`height` | Supported (layout fidelity). |
| GMF `notation:Edge` waypoints | edge `points` | Supported when present. |
| Lazy `.srm`, conditional styles, filters, layers | none | Deferred or unsupported; reported, never silently imported. |

Warning codes specific to `.aird` import: `SIRIUS_AIRD_MODEL_REQUIRED`,
`SIRIUS_AIRD_NO_DIAGRAMS`, `SIRIUS_AIRD_TARGET_UNRESOLVED`,
`SIRIUS_AIRD_TARGET_AMBIGUOUS`, `SIRIUS_AIRD_TARGET_MISSING`,
`SIRIUS_AIRD_EDGE_ENDPOINT_UNRESOLVED`, and
`SIRIUS_AIRD_REPRESENTATION_UNRESOLVED`.

## `.aird` Supported Export Subset

`.aird` export is the inverse of import: it serializes a SpatialDSL model's views
into one Sirius `.aird` session (`POST /interoperability/sirius/aird/export` with
a `modelId`, optional `diagramIds`). Each view becomes one `DSemanticDiagram`
grouped under an `ownedViews` per viewpoint, plus a `notation:Diagram` carrying
GMF layout. An exported session re-imports to the same nodes, edges, and layout.

| SpatialDSL Source | Sirius Output | Notes |
|---|---|---|
| Model | `DAnalysis` + `semanticResources` | One session per export; the semantic resource path is derived from the model name. |
| View (`Diagram`) | `DSemanticDiagram` (`ownedRepresentations`) | `name`, `uid`, and `description` (the representation description) are emitted. |
| View node / edge | `ownedDiagramElements` | `target` references the model element by id; edges emit `sourceNode`/`targetNode`. Elements whose target is not in the model are dropped with a report entry. |
| Node `x`/`y`/`width`/`height` | GMF `notation:Node` `Bounds` | Emitted when present. |
| Node `parentId` | nested GMF `children` | Supported. Child bounds are emitted relative to the parent while SpatialDSL keeps canonical world-space positions. |
| Edge `points` | GMF `notation:Edge` waypoints | Emitted when present. |

Warning codes specific to `.aird` export: `SPATIALDSL_AIRD_NODE_TARGET_UNRESOLVED`,
`SPATIALDSL_AIRD_EDGE_TARGET_UNRESOLVED`, and `SPATIALDSL_AIRD_EDGE_ENDPOINT_MISSING`.

## Unsupported Sirius Features

These constructs must never be silently imported or exported:

- Java extensions and Java services
- complex AQL/OCL expressions
- style customizations
- mapping imports and reused mappings
- Sirius validation-rule and quick-fix definitions
- sequence diagrams
- tables, matrices, and trees
- Sirius custom property-view definitions
- complex tool operation chains
- drag-and-drop tools
- direct-edit, reconnect, and delete tools beyond the documented basic subset
- cross-resource sessions with unresolved semantic or VSM references
- lazy `.srm` representation resources
- Eclipse plugin metadata required for deployed Viewpoint Specification Projects

## Compatibility Report Schema

Every import, export, and validation operation must return this minimum report
shape.

```ts
export interface SiriusCompatibilityReport {
  sourceFormat: 'ecore' | 'xmi' | 'odesign' | 'aird' | 'project-zip';
  targetFormat: 'spatialdsl' | 'sirius-project';
  supported: boolean;
  warnings: SiriusInteropWarning[];
  droppedFeatures: SiriusInteropWarning[];
  unresolvedReferences: SiriusInteropWarning[];
}

export interface SiriusInteropWarning {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  sourcePath?: string;
  sourceElementId?: string;
  spatialElementId?: string;
}
```

Report rules:

- `supported` is `false` when any required source file is missing, malformed, or
  contains unsupported features that prevent a meaningful import/export.
- `warnings` records accepted but notable conditions.
- `droppedFeatures` records Sirius or SpatialDSL features that were skipped or
  approximated.
- `unresolvedReferences` records unresolved semantic, representation, VSM, or
  file references.
- `code` values must be stable enough for tests and UI messaging.

Suggested initial warning codes:

| Code | Use |
|---|---|
| `SIRIUS_UNSUPPORTED_FILE` | Unsupported file extension or file kind. |
| `SIRIUS_UNSUPPORTED_DIALECT` | Unsupported representation dialect such as table, tree, matrix, or sequence. |
| `SIRIUS_UNSUPPORTED_LAYER` | Layer extension or mapping-import construct outside the supported additional-layer subset. |
| `SIRIUS_UNSUPPORTED_EXPRESSION` | Expression cannot be evaluated by the supported subset. |
| `SIRIUS_UNSUPPORTED_TOOL` | Tool operation is outside the basic create subset. |
| `SIRIUS_UNSUPPORTED_STYLE` | Style customization outside basic or conditional style preservation cannot be represented in SpatialDSL. |
| `SIRIUS_DROPPED_STYLE` | Style was accepted with a lossy approximation. |
| `SIRIUS_DROPPED_SESSION_DATA` | `.aird` representation/session content was not imported or exported. |
| `SIRIUS_UNRESOLVED_REFERENCE` | Semantic, VSM, mapping, or file reference did not resolve. |
| `SIRIUS_DEFERRED_AIRD` | A `.aird` file found inside the project-ZIP wrapper is deferred to the dedicated `.aird` workflow. |
| `SIRIUS_DEFERRED_SRM` | Lazy `.srm` compatibility is intentionally deferred. |

## Fixtures

Phase 0 fixtures live in `fixtures/sirius/`.

| Fixture | Purpose |
|---|---|
| `minimal-diagram` | Small supported project with one `.ecore`, one semantic `.xmi`, one `.odesign`, and one `.aird` placeholder. |
| `unsupported-features` | Small project that intentionally includes unsupported Sirius features and an expected compatibility report. |
| `aird-layout` | `.aird` import path: a `DSemanticDiagram` with two nodes and one edge plus GMF `notation:Diagram` layout (node `Bounds` and edge waypoints). |

Fixtures are synthetic and intentionally small. They are meant to drive parser
and compatibility-report behavior before any application code is changed.
