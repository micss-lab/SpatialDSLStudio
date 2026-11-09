# Phase 3: Scoped Creation and Conformance Enforcement (write side)

Goal: new artifacts are created inside the current project; a model can only conform to a
metamodel in the same project; all cross-entity links are validated same-project
**server-side**. Imports (model JSON, Sirius `.odesign`/`.aird`, codegen project import)
become project-aware.

Depends on: Phases 1-2.

## 1. The invariant

For every artifact-to-artifact link, both ends must have the same `projectId`:

| Link | Where created |
|---|---|
| Model.conformsToId -> Metamodel | `model.service.create` / model import |
| Viewpoint.metamodelId -> Metamodel | `viewpoint.service.create` / `.odesign` import |
| Diagram.modelId -> Model | `diagram.service.create` / `.aird` import |
| Diagram.viewpointId -> Viewpoint (optional) | diagram create/update |
| CodeGenerationProject.targetMetamodelId (loose) | codegen project create/update |
| TestCase.modelId (loose, model or metamodel) | test case create |
| TransformationRule.diagramId (loose, optional) | rule create/update |

Loose links are validated only when they resolve; a dangling loose id is tolerated (as
today) but logged.

Central helper in the backend, used by all services:

```ts
// backend/src/services/project-scope.util.ts
assertSameProject(projectId: string | null, linked: { projectId: string | null }, what: string)
// throws ApiError(400, `${what} belongs to a different project`)
```

Until Phase 5, `projectId: null` on either side skips the check (legacy rows).

## 2. Shared request types (`shared/types/index.ts`)

Add `projectId?: string` to `CreateMetamodelRequest`, `CreateModelRequest`,
`CreateDiagramRequest`, `CreateViewpointRequest`, `CreateTransformationRuleRequest`,
codegen project create, and test case create payloads.

## 3. Backend service changes

Pattern for every `create` (using `model.service.ts:114-130` as the example):

1. Resolve the effective `projectId`:
   - If the request carries `projectId`: verify the user can write to that project
     (Phase 3 rule: user owns the project, OR is admin; Phase 4 extends this to
     EDITOR/OWNER members).
   - If absent: **derive from the linked parent** (model -> metamodel's project,
     diagram -> model's project, viewpoint -> metamodel's project). This keeps old
     clients and scripts working.
2. Validate same-project for every link in the table above via `assertSameProject`.
3. Persist `projectId` on the new row.

Specific touchpoints:

- `metamodel.service.create`: takes `projectId` directly (metamodels are cluster roots;
  no parent to derive from). If absent, fall back to the caller's Unassigned project
  (create lazily) so the API never produces null-project metamodels going forward.
- `model.service.create` (`model.service.ts:114`): after the existing metamodel access
  check (line 120), load the metamodel's `projectId`, derive/validate, reject
  cross-project conformance with 400. **This is the core rule of the feature.**
- `model.service.update`: if `conformsTo` can change via update, apply the same check.
- `diagram.service.create`: derive from model; if `viewpointId` present, assert the
  viewpoint is same-project.
- `viewpoint.service.create`: derive from metamodel.
- `codegeneration.service` create/update: if `targetMetamodelId` resolves, assert
  same-project; `isExample` packs exempt.
- `test.service` create: resolve loose `modelId` (model then metamodel) and derive.
- `transformation.service` create/update: derive from `diagramId` when resolvable, else
  accept explicit `projectId`, else Unassigned.
- Duplicate/clone endpoints (if any service exposes them) inherit the source's project.

## 4. Import paths

- **Model JSON import** (`ModelManager.tsx` `handleImportModel` -> model create API):
  imports into the **current project**; the imported `conformsTo` must resolve to a
  metamodel in that project, otherwise reject with a clear message ("The model conforms
  to a metamodel outside the current project").
- **Sirius `.odesign` import** (`backend/src/services/sirius-interop.service.ts`,
  `importOdesign` ~line 164-190): already attaches to an existing `metamodelId`; the
  created viewpoints derive that metamodel's project (rule 3.1). No API change needed,
  but add the derivation + a test.
- **Sirius `.aird` import** (`importAird` ~line 192-227): diagrams derive from the target
  `modelId`'s project. Same treatment.
- **Ecore/XMI import** (creates metamodels/models): accept `projectId` in the request
  body from the frontend's current project; frontend passes
  `currentProjectId` (require a concrete project selected for import when in
  "All projects": prompt the user to pick one in the import dialog).
- **Codegen project import** (`frontend/src/components/codegeneration/hooks/useProjectManagement.ts`
  `handleImportProject`): stamp current project; validate `targetMetamodelId` per 3.

## 5. Frontend changes

- **Creation requires a concrete project**: when `currentProjectId === null`
  ("All projects"), creation dialogs show a project dropdown (defaulting to the last
  used); when a project is selected, they stamp it silently and display a small
  "in <project name>" chip. Applies to: `MetamodelManager` create dialog, `ModelManager`
  `renderCreateModelDialog` (~line 253), diagram/view creation in `DiagramsPage`,
  viewpoint creation, codegen project creation, test case creation, transformation rule
  creation.
- **Conformance dropdown scoping**: in `ModelManager.tsx` the "Conforms to Metamodel"
  `Select` lists only metamodels of the effective project (current project, or the one
  picked in the dialog). Same for viewpoint's metamodel picker and any diagram dialog
  that picks a model: models listed are those of the effective project.
- **Error surfacing**: map the new 400 "different project" errors to friendly dialog
  messages.

## 6. Tests

Backend (extend existing suites):

- model create: same-project OK; cross-project 400; legacy null-project metamodel still
  accepted (pre-Phase-5 tolerance); derivation when `projectId` omitted.
- diagram create: model-derivation; cross-project viewpoint 400.
- viewpoint create: metamodel derivation.
- codegen/test/transformation: loose-link resolution matrix (resolves same-project OK,
  resolves cross-project 400, dangling tolerated).
- sirius-interop: `.odesign` and `.aird` imports stamp the derived project.
- metamodel create: explicit project honored; missing project -> Unassigned fallback.

Frontend:

- ModelManager dialog lists only in-project metamodels; create stamps projectId.
- "All projects" creation flow forces a project choice.

## 7. Acceptance criteria

- [ ] With project A selected, the model-create dialog offers only A's metamodels, and
      the created model lands in A.
- [ ] Direct API call creating a model in A conforming to a metamodel in B returns 400.
- [ ] All import paths place artifacts in the expected project.
- [ ] Legacy rows with `projectId = null` can still be linked to (tolerance verified by
      test) so nothing breaks for un-backfilled environments.
- [ ] Existing backend test suite green.

## 8. Rollback

Revert the code. Rows created during the phase keep their `projectId` (harmless, already
supported since Phase 1). No migration involved.
