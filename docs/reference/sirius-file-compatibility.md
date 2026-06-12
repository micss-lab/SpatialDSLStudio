# Sirius File Compatibility

This page defines the Phase 0 file compatibility contract for future Sirius
Desktop project interchange. It is a specification and fixture guide, not a
claim that all listed Sirius formats are implemented today.

SpatialDSL Studio currently supports partial semantic interchange through
Ecore metamodel files and EMF-style XMI model files. The backend Sirius
interoperability API also supports an initial `.odesign` validate/import/export
subset for diagram Viewpoint Specification Models. Sirius `.aird`
session/representation files are not implemented yet.

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
| `.aird` | Deferred | Do not import or export session/representation data until semantic and `.odesign` compatibility are stable. Validation may detect the file and report that `.aird` handling is deferred. |
| `.representation/*.srm` | Deferred | Detect references to lazy representation resources and report them as deferred or unresolved if the referenced file is missing. |
| project `.zip` | Supported wrapper | Treat as a relative-path bundle containing the files above. Validate paths and sizes before parsing XML. |

## `.odesign` Supported Subset

The first `.odesign` implementation should support:

| Sirius Element | SpatialDSL Mapping | Compatibility |
|---|---|---|
| `Group` | import/export bundle metadata | Supported for name and traceability only. |
| `Viewpoint` | Viewpoint | Supported for stable id/name, label, and model file extensions. |
| `DiagramDescription` | Representation Description with `kind = diagram` | Supported for name, label, domain class, and default layer contents. |
| Default layer | Representation mapping container | Supported. |
| Additional layers | none | Unsupported. Report and skip. |
| Node mapping | visible/creatable metaclass plus notation override | Supported when the domain class resolves and candidate expression is simple. |
| Container mapping | visible/creatable metaclass plus container notation | Supported when it maps a containment hierarchy. |
| Bordered node mapping | semantic pin or attached node mapping | Supported for simple domain-class mappings attached to owner nodes. |
| Relation-based edge mapping | reference edge mapping | Supported when source/target mappings resolve and target finder is a direct reference expression. |
| Element-based edge mapping | none | Lossy or unsupported unless it can be represented as a direct reference edge. |
| Basic node/container/edge style | concrete syntax override | Supported for shape, fill color, border color, line style, label expression, and edge arrows where representable. |
| Basic create tool | representation-specific creation affordance | Supported only for simple create-instance behavior. |

Simple expressions are limited to direct feature access such as
`feature:name`, `feature:children`, or `aql:self.children`. Any expression that
requires Java services, complex AQL/OCL evaluation, multi-step operation chains,
or runtime interpreter state is unsupported in the first implementation.

## Unsupported Sirius Features

These constructs must never be silently imported or exported:

- Java extensions and Java services
- complex AQL/OCL expressions
- conditional styles
- style customizations
- filters
- additional layers and mapping imports
- validation rules and quick fixes
- sequence diagrams
- tables, matrices, and trees
- custom property views
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
| `SIRIUS_UNSUPPORTED_LAYER` | Non-default layer or layer import encountered. |
| `SIRIUS_UNSUPPORTED_EXPRESSION` | Expression cannot be evaluated by the supported subset. |
| `SIRIUS_UNSUPPORTED_TOOL` | Tool operation is outside the basic create subset. |
| `SIRIUS_UNSUPPORTED_STYLE` | Style feature cannot be represented in SpatialDSL. |
| `SIRIUS_DROPPED_STYLE` | Style was accepted with a lossy approximation. |
| `SIRIUS_DROPPED_SESSION_DATA` | `.aird` representation/session content was not imported or exported. |
| `SIRIUS_UNRESOLVED_REFERENCE` | Semantic, VSM, mapping, or file reference did not resolve. |
| `SIRIUS_DEFERRED_AIRD` | `.aird` compatibility is intentionally deferred. |
| `SIRIUS_DEFERRED_SRM` | Lazy `.srm` compatibility is intentionally deferred. |

## Fixtures

Phase 0 fixtures live in `fixtures/sirius/`.

| Fixture | Purpose |
|---|---|
| `minimal-diagram` | Small supported project with one `.ecore`, one semantic `.xmi`, one `.odesign`, and one `.aird` placeholder. |
| `unsupported-features` | Small project that intentionally includes unsupported Sirius features and an expected compatibility report. |

Fixtures are synthetic and intentionally small. They are meant to drive parser
and compatibility-report behavior before any application code is changed.
