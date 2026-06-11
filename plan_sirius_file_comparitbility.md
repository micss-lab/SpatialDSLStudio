# Sirius Desktop File Compatibility Plan

## Purpose

Plan file compatibility between SpatialDSL Studio and Eclipse Sirius Desktop.

This document is an agent handoff. It records what has already been completed in
this workspace, the current compatibility boundary, and the next implementation
work needed to support Sirius Desktop project-file interchange.

## Current Repository Context

SpatialDSL Studio now supports a Sirius-style web specifier workflow, but it is
not yet file-compatible with Sirius Desktop projects.

Related local documents:

- `viewpoints-phases-3-5-implementation-plan.md`
- `sirius-desktop-parity-roadmap.md`
- `docs/reference/sirius-compatibility.md`
- `ecore-xmi-interop.md`

Important current statement:

- SpatialDSL supports partial semantic interchange through Ecore metamodel
  import/export and XMI model import/export.
- SpatialDSL does not currently import or export Sirius `.odesign` Viewpoint
  Specification Models.
- SpatialDSL does not currently import or export Sirius `.aird`
  session/representation files.

## Completed Work In This Session

The requested Viewpoints phases 3 through 5 were implemented as scoped.

Completed implementation areas:

- Viewpoint management UI.
- Representation Description editor.
- Route support for `/metamodels/:metamodelId/viewpoints`.
- Metamodel row action for opening Viewpoints.
- Backend viewpoint uniqueness/default validation.
- Representation normalization.
- Diagram links to viewpoint and representation descriptions.
- Diagram projection filtering based on representation visibility rules.
- Representation-specific notation overrides.
- Reference edge notation overrides.
- Semantic pin nodes attached to owner boundaries.
- Contextual pin creation.
- Pin side/offset drag behavior.
- Pin owner validation.
- Edge anchoring to pin centers.
- Activity example data updated to exercise semantic pins.
- Docs updated to use the newer Sirius-style terminology.
- Deployment docs and compose configuration reviewed/updated.

Verification already run after the implementation:

- Backend Jest suite passed: 515/515 tests.
- Frontend Jest suite passed: 92/92 tests.
- Backend typecheck passed.
- Frontend production build passed.
- Docker compose config checks passed for development and production files.
- `git diff --check` passed.
- Dev server HTTP smoke check returned `200 OK`.

Known verification limitation:

- In-app Browser testing was unavailable during the previous verification pass,
  so visual browser QA should be rerun when browser tooling is available.

## Compatibility Terminology

Use these terms consistently:

| SpatialDSL Studio | Sirius Desktop Equivalent | Meaning |
|---|---|---|
| Metamodel | Ecore metamodel | Semantic language definition. |
| Model | EMF semantic resource | Instance data conforming to a metamodel. |
| Viewpoint | Viewpoint in `.odesign` | Definition-level modeling perspective. |
| Representation Description | Diagram/table/tree description | Specification for what a view can show and create. |
| View | Representation instance | Concrete saved projection users open and edit. |
| `/api/diagrams` resource | Compatibility view endpoint | Existing API/table name for view resources. |

## Compatibility Target

Treat Sirius compatibility as three layers.

1. Semantic interchange:
   - `.ecore`
   - `.xmi`
2. Specifier interchange:
   - `.odesign`
3. Session and representation interchange:
   - `.aird`
   - optional `.representation/*.srm` for Sirius lazy representation resources

Do not implement `.aird` before the semantic and `.odesign` layers are stable.
The `.aird` format references both semantic resources and viewpoint
specifications, so it depends on the other layers.

## Sirius Concepts To Preserve

From official Sirius documentation:

- Sirius assumes the semantic domain is EMF-based.
- A Viewpoint Specification Model is stored in `.odesign`.
- A `.odesign` contains Viewpoints and Representation Descriptions.
- Diagram descriptions contain mappings, styles, tools, layers, filters,
  validation rules, and layout configuration.
- A Sirius session is serialized as `.aird`.
- A `.aird` references semantic resources, representation resources, and the
  Viewpoint Specification Models used by the session.
- Sirius representation data is separate from semantic model data.

References:

- https://eclipse.dev/sirius/doc/specifier/general/Specifying_Viewpoints.html
- https://eclipse.dev/sirius/doc/specifier/diagrams/Diagrams.html
- https://eclipse.dev/sirius/doc/developer/Architecture.html
- https://eclipse.dev/sirius/doc/developer/Meta-models.html
- https://eclipse.dev/sirius/doc/developer/representations_lazy_loading.html

## Phase 0: Compatibility Spec And Fixture Suite

Goal:

- Define the exact supported Sirius file subset before coding.

Deliverables:

- Add `docs/reference/sirius-file-compatibility.md`.
- Add fixture directory for real and synthetic Sirius projects.
- Add a compatibility report schema.
- Add a compatibility matrix that distinguishes supported, lossy, and
  unsupported constructs.

Suggested fixture layout:

```text
fixtures/sirius/
  minimal-diagram/
    description/minimal.odesign
    model/minimal.ecore
    model/sample.xmi
    representations.aird
  pins-and-edges/
  containers/
  unsupported-features/
```

Compatibility report shape:

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

Acceptance criteria:

- Every import/export operation returns a compatibility report.
- Unsupported Sirius features are reported explicitly.
- No silent data loss is allowed for the supported subset.

## Phase 1: Harden Ecore And XMI Semantic Compatibility

Goal:

- Make the existing semantic interchange reliable enough for Sirius project
  import/export to build on.

Work items:

- Improve `.ecore` import/export for:
  - `EEnum` and enum literals.
  - custom `EDataType`.
  - `eOpposite`.
  - containment references.
  - inherited classes and inline `eSuperTypes`.
  - `defaultValueLiteral`.
  - Ecore annotations, including OCL annotations where applicable.
  - `nsURI` and `nsPrefix`.
- Improve `.xmi` import/export for:
  - stable `xmi:id` handling.
  - containment paths.
  - non-containment references.
  - enum literal validation.
  - single-root and multi-root resources.
  - clear warnings for dropped layout/presentation data.
- Add golden tests using Sirius/EMF sample files.
- Keep SpatialDSL view/layout metadata separate from semantic XMI unless an
  explicit sidecar export is requested.

Recommended code areas:

- `frontend/src/services/metamodel/ecore.service.ts`
- `frontend/src/services/model/model-xmi-import.service.ts`
- `frontend/src/services/model/model-xmi-export.service.ts`
- `frontend/src/__tests__/services/ecore-xmi-interop.test.ts`

Acceptance criteria:

- Typical single-package Ecore models round-trip without semantic loss.
- XMI model files import/export against matching metamodels.
- Unsupported constructs are reported through warnings.
- Tests cover EMF-style reference fragments and optional `xmi:id`.

## Phase 2: `.odesign` Import

Goal:

- Import Sirius Viewpoint Specification Models into SpatialDSL viewpoints and
  representation descriptions.

Input:

- Sirius `.odesign` file.
- Matching imported or bundled `.ecore` metamodel.

Mapping target:

| Sirius `.odesign` Element | SpatialDSL Target |
|---|---|
| `Group` | Import bundle/group metadata |
| `Viewpoint` | Viewpoint |
| `DiagramDescription` | Representation Description with `kind = diagram` |
| node mapping | visible/creatable metaclass plus notation override |
| container mapping | visible/creatable metaclass plus containment/container mapping |
| bordered node mapping | pin mapping or attached node mapping |
| edge mapping | reference edge mapping |
| basic style | concrete syntax override |
| basic creation tool | representation-specific creation tool |

Unsupported v1 features:

- Java services.
- Complex AQL/OCL expressions.
- Conditional styles.
- Layers.
- Filters.
- Validation quick fixes.
- Sequence diagrams.
- Tables and trees.
- Custom property views.
- Advanced tool operation chains.

Implementation recommendation:

- Put parsing in backend or a shared interop package, not inside UI
  components.
- Use a real XML/XMI parser rather than string manipulation.
- Preserve original Sirius IDs for traceability.
- Generate stable SpatialDSL IDs from Sirius IDs where possible.
- Store unsupported Sirius content in an import report, not in partially
  interpreted fields.

Suggested modules:

- `backend/src/services/sirius-interop.service.ts`
- `backend/src/routes/sirius-interop.routes.ts`
- `shared/types/sirius-interop.ts`, if shared types are available
- Frontend wizard under `frontend/src/components/interoperability/`

Acceptance criteria:

- Import a minimal Sirius `.odesign` with one Viewpoint and one
  `DiagramDescription`.
- Import basic node, container, bordered-node, and edge mappings.
- Imported representation descriptions appear in the Viewpoint manager.
- Imported diagram descriptions can be used to create SpatialDSL views.
- Unsupported Sirius features are visible in the compatibility report.

## Phase 3: `.odesign` Export

Goal:

- Export SpatialDSL viewpoints and representation descriptions as Sirius
  `.odesign`.

Output:

- `description/<name>.odesign`
- optional generated Eclipse plugin metadata later if full Sirius Viewpoint
  Specification Project export is needed

Work items:

- Emit Sirius Viewpoint Specification Model XML/XMI for the supported subset.
- Export Viewpoint IDs and labels.
- Export Diagram Description IDs, labels, domain class, mappings, styles, and
  basic tools.
- Export node, container, bordered-node/pin, and edge mappings.
- Export basic palette/create tools when SpatialDSL tool definitions exist.
- Attach a compatibility report for unsupported SpatialDSL-only data.

Acceptance criteria:

- Exported `.odesign` opens in Sirius Desktop.
- Sirius Desktop VSM validation passes for the supported subset.
- A Sirius user can enable the exported viewpoint and create a basic diagram
  over the exported semantic model.

## Phase 4: `.aird` Import

Goal:

- Import saved Sirius sessions and diagram representation instances.

Input bundle:

- `.aird`
- semantic `.xmi`
- referenced `.ecore`
- referenced `.odesign`
- optional `.representation/*.srm`

Work items:

- Parse `.aird` as Sirius representation/session data.
- Resolve semantic resources listed in the session.
- Resolve referenced Viewpoint Specification Models.
- Convert enabled Sirius `DView` records into SpatialDSL viewpoint context.
- Convert owned diagram representations into SpatialDSL views.
- Preserve:
  - represented semantic element IDs.
  - diagram element positions.
  - bendpoints.
  - labels where available.
  - style overrides where supported.
  - selected/enabled viewpoint information where useful.
- Warn on:
  - unresolved semantic resource references.
  - unsupported representation dialects.
  - unsupported diagram elements.
  - lazy `.srm` representation resources not supplied in the bundle.

Acceptance criteria:

- Import a Sirius project bundle containing one `.aird` and one diagram.
- SpatialDSL creates the matching metamodel, model, viewpoint, representation
  description, and view.
- Imported views preserve meaningful layout for supported diagram elements.
- Unsupported data is reported.

## Phase 5: `.aird` Export

Goal:

- Export a SpatialDSL project bundle that Sirius Desktop can open.

Output bundle:

```text
exported-project/
  description/<name>.odesign
  model/<name>.ecore
  model/<name>.xmi
  representations.aird
```

Optional later output:

```text
exported-project/
  .representation/*.srm
```

Work items:

- Export semantic metamodel and model first.
- Export `.odesign` for the supported representation descriptions.
- Generate `.aird` session data referencing:
  - semantic resources.
  - enabled viewpoints.
  - owned views.
  - owned representations.
  - diagram elements and their semantic targets.
- Preserve view layout and edge bendpoints when representable in Sirius.
- Generate stable and repeatable identifiers.
- Validate output by opening it in Sirius Desktop.

Important architecture decision:

- For high-fidelity `.aird` export, prefer a small Java/EMF/Sirius helper over
  hand-written TypeScript XML generation.
- TypeScript XML generation is acceptable for `.odesign` MVP work, but `.aird`
  is session data with EMF references into semantic resources and VSMs. Using
  Sirius/EMF APIs will reduce brittle output and improve compatibility.

Acceptance criteria:

- Exported project opens in Sirius Desktop.
- Sirius Desktop can enable the exported viewpoint.
- Sirius Desktop can open exported diagram representations.
- Semantic model data remains valid EMF XMI.
- SpatialDSL re-import of the exported bundle produces equivalent supported
  data.

## UI And API Plan

Add a Sirius project compatibility workflow.

Frontend:

- Add `Import Sirius Project` action.
- Add `Export Sirius Project` action.
- Accept a `.zip` bundle for project-level import.
- Show compatibility report before final import.
- Show compatibility report before download on export.
- Link to `docs/reference/sirius-compatibility.md`.

Backend API:

- `POST /api/interoperability/sirius/validate`
- `POST /api/interoperability/sirius/import`
- `POST /api/interoperability/sirius/export`

Import options:

```ts
export interface SiriusImportOptions {
  importEcore: boolean;
  importXmi: boolean;
  importOdesign: boolean;
  importAird: boolean;
  failOnUnsupportedFeatures: boolean;
  preserveSiriusIds: boolean;
}
```

Export options:

```ts
export interface SiriusExportOptions {
  includeEcore: boolean;
  includeXmi: boolean;
  includeOdesign: boolean;
  includeAird: boolean;
  includeSpatialDslSidecar: boolean;
  failOnUnsupportedFeatures: boolean;
}
```

## Security And Robustness Requirements

Coordinate with a security engineer before shipping import/export.

Required checks:

- Reject zip slip paths such as `../`.
- Set file size limits.
- Set maximum XML node count and depth.
- Disable external entity resolution.
- Avoid network fetches while resolving XML references.
- Treat all imported IDs and names as untrusted input.
- Validate MIME/type by content, not only extension.
- Return structured errors instead of parser stack traces.
- Log import/export events without storing raw uploaded model content in logs.

## DevOps And Deployment Requirements

Coordinate with a DevOps engineer before enabling project-level import/export.

Required checks:

- Configure upload size limits for the API/proxy.
- Configure temp storage cleanup for uploaded bundles.
- Document any Java/EMF helper service if introduced.
- Add health checks for helper service if introduced.
- Add Docker image/package changes for XML/zip dependencies.
- Update deployment docs with storage and memory expectations.
- Add CI tests for import/export fixtures.

## Testing Strategy

Unit tests:

- Ecore parser/exporter.
- XMI parser/exporter.
- `.odesign` parser/exporter.
- `.aird` parser/exporter.
- Compatibility report generation.
- Security validation for XML and zip inputs.

Integration tests:

- Import Sirius sample project bundle.
- Export SpatialDSL sample project bundle.
- Re-import exported SpatialDSL bundle.
- Compare supported semantic and representation data.

Manual/Sirius Desktop smoke tests:

- Open exported `.odesign` in Sirius Desktop.
- Validate VSM in Sirius Desktop.
- Open exported project with `representations.aird`.
- Create and edit one supported diagram.
- Confirm unsupported features were warned before export.

Regression tests:

- Existing backend Jest suite.
- Existing frontend Jest suite.
- Backend typecheck.
- Frontend build.
- Docker compose config checks.
- `git diff --check`.
- Browser UI QA when browser tooling is available.

## Recommended Implementation Order

1. Write the detailed compatibility spec and fixture suite.
2. Harden `.ecore` and `.xmi`.
3. Implement `.odesign` import.
4. Implement `.odesign` export.
5. Add the Sirius project import/export UI shell with reports.
6. Implement `.aird` import.
7. Decide on Java/EMF/Sirius helper for `.aird` export.
8. Implement `.aird` export.
9. Run security review.
10. Run DevOps/deployment review.
11. Run full automated and Sirius Desktop manual compatibility tests.

## Definition Of Done

This roadmap is complete only when:

- SpatialDSL imports a Sirius project bundle containing `.ecore`, `.xmi`,
  `.odesign`, and `.aird`.
- SpatialDSL exports a Sirius project bundle that Sirius Desktop opens.
- Exported Sirius `.odesign` validates in Sirius Desktop.
- Exported Sirius `.aird` opens diagram representations in Sirius Desktop.
- Supported semantic data round-trips without loss.
- Supported diagram layout data round-trips with acceptable fidelity.
- Unsupported features are reported in a compatibility report.
- Full backend and frontend automated tests pass.
- Security review is complete.
- Deployment docs and Docker/runtime configuration are updated.

## Notes For Future Agents

- Do not claim full Sirius Desktop parity until `.odesign` and `.aird`
  import/export exist and are tested in Sirius Desktop.
- Keep semantic `.xmi` separate from representation/session data.
- Do not silently encode SpatialDSL view metadata into semantic XMI.
- Keep `/api/diagrams` compatibility naming unless a separate migration is
  planned.
- Use official Eclipse Sirius documentation for format concepts.
- Prefer fixture-driven development over ad hoc parser changes.
- Preserve user work in the current dirty git tree. Do not revert unrelated
  changes.
