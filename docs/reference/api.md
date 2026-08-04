# API Reference

Technical reference for backend endpoints under `/api`.

## Base URL and auth

- Base path: `/api`
- Authentication: `Authorization: Bearer <token>`
- Public endpoints: `/api/health`, `/api/auth/*` (except protected auth operations)
- Most resource endpoints require authentication middleware

## Response conventions

Most resource routes return:

```json
{
   "success": true,
   "data": {}
}
```

Error shape (common):

```json
{
   "success": false,
   "error": "message"
}
```

Validation failures can also include:

- `details[]` with `field` and `message`

Note: auth routes have some responses without `success` wrapper (for example direct `{ user, token }` payloads).

## Auth endpoints

Base: `/api/auth`

- `POST /register`
- `POST /login`
- `GET /me` (auth required)
- `POST /change-password` (auth required)
- `POST /verify`

Security notes:

- auth routes are rate-limited
- token verification can return `valid: false` responses

## Health endpoint

- `GET /api/health`

Returns service heartbeat and timestamp.

## Project endpoints

Base: `/api/projects`

A Studio Project is the workspace, navigation context, and authorization
boundary that owns every modeling artifact. Each artifact belongs to exactly one
project.

- `GET /` (optional query: `includeArchived`)
- `POST /`
- `GET /:projectId`
- `PUT /:projectId`
- `POST /:projectId/archive`
- `POST /:projectId/restore`
- `GET /:projectId/members`
- `POST /:projectId/members` (body: `email`, `role`)
- `PATCH /:projectId/members/:userId` (body: `role`)
- `DELETE /:projectId/members/:userId`

Membership roles are `OWNER`, `DSL_DESIGNER`, `MODELER`, and `VIEWER`. They are
separate from the platform-wide `UserRole`; `ADMIN` stays a platform concern.

An archived project is read-only: any non-`GET`/`HEAD`/`OPTIONS` request to its
scoped routes returns `409`.

## Project-scoped resource endpoints

Every resource group is also mounted under a project. These are the canonical
URLs; the flat routes above remain as compatibility adapters.

- `/api/projects/:projectId/epackages`
- `/api/projects/:projectId/metamodels`
- `/api/projects/:projectId/viewpoints`
- `/api/projects/:projectId/models`
- `/api/projects/:projectId/views`
- `/api/projects/:projectId/transformations`
- `/api/projects/:projectId/code-generation`
- `/api/projects/:projectId/tests`
- `/api/projects/:projectId/files`
- `/api/projects/:projectId/interoperability`
- `/api/projects/:projectId/lifecycle`
- `/api/projects/:projectId/pipelines`

Path parameters are validated against project membership, so a user who belongs
to two projects cannot address project B's artifact through project A's URL;
that returns `404`, not `403`.

## EPackage (meta-metamodel) endpoints

Base: `/api/epackages`

- `GET /`
- `GET /core`
- `GET /:id`
- `GET /uri/:nsURI`
- `POST /`
- `PUT /:id`
- `DELETE /:id`

## Metamodel endpoints

Base: `/api/metamodels`

- `GET /`
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/classes`
- `PUT /:id/classes/:classId`
- `DELETE /:id/classes/:classId`
- `POST /:id/constraints`
- `POST /:id/classes/:classId/constraints`

Metamodel evolution (project-scoped mount only):

- `POST /:id/evolution/preview`
- `POST /:id/evolution/apply`
- `GET /:id/evolution/migrations`

See [Metamodel evolution endpoints](#metamodel-evolution-endpoints) for the
request and response contracts.

## Model endpoints

Base: `/api/models`

- `GET /` (optional query: `metamodelId`)
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/elements`
- `PUT /:id/elements/:elementId`
- `DELETE /:id/elements/:elementId`
- `POST /:id/connections`
- `DELETE /:id/connections/:connectionId`

## Diagram/View endpoints

Base: `/api/diagrams`

These endpoints retain the `/api/diagrams` path for compatibility. In the current product model, a diagram row represents a view: a projection of model elements plus view-specific grid settings.

- `GET /` (optional query: `modelId`)
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/model-elements`
- `POST /:id/model-elements/add-all`
- `PUT /:id/model-elements/:modelElementId/presentation`
- `DELETE /:id/model-elements/:modelElementId`
- `POST /:id/elements`
- `PUT /:id/elements/:elementId`
- `DELETE /:id/elements/:elementId`
- `PUT /:id/grid-settings`

The `model-elements` routes are the preferred view-membership API. The `elements` routes are compatibility routes for older clients.

Create and update payloads may include optional `viewpointId` and `representationDescriptionId`. When omitted, the backend resolves the model metamodel's default viewpoint and default diagram representation description. Explicit `diagram`, `table`, and `tree` descriptions are accepted as executable view resources. Diagram-only membership, layout, and palette operations reject table/tree views.

## Viewpoint endpoints

Base: `/api/viewpoints`

Viewpoints are metamodel-level specification resources. Access follows the owning metamodel rather than adding a separate shareable resource type.

- `GET /` (optional query: `metamodelId`)
- `GET /default?metamodelId=:id`
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `GET /:id/representation-descriptions`
- `POST /:id/representation-descriptions`
- `PUT /:id/representation-descriptions/:representationDescriptionId`
- `DELETE /:id/representation-descriptions/:representationDescriptionId`

Representation descriptions are embedded in the viewpoint JSON. Executable kinds are `diagram`, `table`, and `tree`. Table descriptions may include `tableColumns: string[]` to select and order editable attribute columns.

Diagram descriptions may include containment-driven `containerMappings`:

```json
{
  "containerMappings": [
    {
      "id": "system-components",
      "containerMetaClassId": "system-metaclass-id",
      "containmentReferenceId": "components-reference-id",
      "childMetaClassIds": ["component-metaclass-id"],
      "concreteSyntax": {
        "two_d": {
          "shape": "rectangle",
          "fillColor": "#f8fafc",
          "strokeColor": "#64748b",
          "defaultSize": { "width": 420, "height": 260 }
        }
      }
    }
  ]
}
```

Mapping IDs, container metaclass IDs, and containment reference IDs are
required. `childMetaClassIds` restricts compatible contained node types. A
non-empty mapping list is rejected for table and tree descriptions. Materialized
diagram nodes expose `parentId` and `containerMappingId` as projection metadata;
the semantic containment reference remains the source of truth.

Diagram descriptions may also include `propertySections`:

```json
{
  "propertySections": [
    {
      "id": "robot-status",
      "name": "Robot Status",
      "metaClassIds": ["mobile-robot-metaclass-id"],
      "attributeNames": ["BatteryLevel", "HasProduct"],
      "referenceNames": ["assignedStation"]
    }
  ]
}
```

Section IDs must be unique and names are required. All field lists are normalized
to unique non-empty strings. Empty or omitted `metaClassIds` applies a section to
all visible metaclasses; configured superclasses also match subclasses. A
non-empty `propertySections` list is rejected for table and tree descriptions.
This metadata controls the existing semantic model update/reference APIs; it does
not create a separate property-value endpoint.

Diagram descriptions may include `toolDefinitions`. Native executable tool
types are `create-node`, `create-edge`, `delete`, and `reconnect`; `direct-edit`
is accepted as specification data but does not yet execute custom logic. Legacy
`node` and `edge` values are normalized to `create-node` and `create-edge`.
Create-node tools can carry the minimal operation payload below:

```json
{
  "id": "create-robot",
  "name": "Mobile Robot",
  "type": "create-node",
  "metaClassId": "robot-metaclass-id",
  "payload": {
    "operations": [
      {
        "type": "set-attribute",
        "attributeName": "BatteryLevel",
        "value": 100
      }
    ]
  }
}
```

`set-attribute` is the only operation type. The backend accepts at most 50
operations per tool, rejects duplicate attribute names and non-scalar values,
and only accepts operations on create-node tools. The editor additionally
checks the selected metaclass and attribute type before applying values. Tool
execution uses the existing model and view persistence APIs; there is no
separate arbitrary-operation endpoint or expression evaluator.

## Sirius interoperability endpoints

Base: `/api/interoperability/sirius`

These endpoints implement the first Sirius compatibility slice for Viewpoint Specification Models and diagram representations. `.odesign` validate/import/export and dedicated `.aird` validate/import/export are supported for their documented subsets. Validation also recognizes `.ecore`, `.xmi`, and base64-encoded `project-zip` payloads so delegated files appear in the compatibility report instead of being silently ignored.

- `POST /validate`
- `POST /import`
- `POST /export`
- `POST /aird/import`
- `POST /aird/export`
- `POST /project/export`

`validate` accepts JSON `{ content, sourceFormat?, metamodelId?, options? }` and returns a compatibility report plus a preview of imported viewpoints. For `sourceFormat: "project-zip"`, `content` is a base64 ZIP payload and the backend validates safe relative paths before delegating the first `.odesign` file it finds. `import` accepts `{ content, metamodelId, options? }` and creates SpatialDSL viewpoints and diagram representation descriptions for the supported `.odesign` subset. `export` accepts `{ metamodelId, viewpointIds?, options? }` and returns `{ filename, content, report }` for generated `.odesign` XML.

`aird/import` accepts `{ content, modelId, viewpointId?, options? }`; semantic
targets are resolved against that existing model. `aird/export` accepts
`{ modelId, diagramIds?, options? }`. Both preserve supported GMF bounds and
waypoints, including nested GMF child nodes for container-mapped diagrams.

`project/export` accepts `{ metamodelId, modelId?, viewpointIds?, diagramIds? }`
and returns a base64 ZIP payload. The bundle includes `.project`, one `.ecore`,
one semantic `.xmi`, one `.odesign`, `representations.aird`, and a compatibility
report. The `.aird` references use the exact relative paths and IDs of the other
bundled resources.

Every operation returns a `SiriusCompatibilityReport` with `warnings`, `droppedFeatures`, and `unresolvedReferences`.

## Transformation endpoints

Base: `/api/transformations`

Rule CRUD:

- `GET /rules`
- `GET /rules/:id`
- `POST /rules`
- `PUT /rules/:id`
- `DELETE /rules/:id`

Compatibility routes:

- `GET /patterns` (returns empty list)
- `POST /patterns` (no-op passthrough)
- `PUT /patterns/:id` (no-op passthrough)
- `DELETE /patterns/:id` (no-op)
- `GET /executions` (returns empty list)

## Code generation endpoints

Base: `/api/codegen`

- `GET /projects` (optional query: `metamodelId`)
- `GET /projects/:id`
- `POST /projects`
- `PUT /projects/:id`
- `DELETE /projects/:id`
- `POST /projects/:id/templates`
- `PUT /projects/:id/templates/:templateId`
- `DELETE /projects/:id/templates/:templateId`

## Testing endpoints

Base: `/api/tests`

- `GET /`
- `GET /cases` (alias)
- `POST /cases`
- `PUT /cases/:id`
- `GET /:id`
- `POST /`
- `POST /batch`
- `PUT /:id`
- `PUT /:id/status`
- `PUT /:id/values`
- `DELETE /:id`
- `DELETE /model/:modelId`
- `POST /model/:modelId/reset`

## File storage endpoints

Base: `/api/files`

- `GET /`
- `GET /stats`
- `GET /:id`
- `GET /:id/data`
- `GET /:id/download`
- `POST /upload` (multipart)
- `POST /upload-base64`
- `PUT /:id/metadata`
- `DELETE /:id`
- `POST /cleanup`

## Sharing endpoints

Base: `/api/share`

- `POST /:resourceType/:resourceId/share`
- `DELETE /:resourceType/:resourceId/share/:userId`
- `GET /:resourceType/:resourceId/shares`
- `GET /shared-with-me`
- `GET /:resourceType/:resourceId/access`

Valid resource types:

- `METAMODEL`
- `MODEL`
- `DIAGRAM`
- `TRANSFORMATION_RULE`
- `CODEGEN_PROJECT`
- `TEST_CASE`

Valid share permissions:

- `VIEWER`
- `EDITOR`

## Lifecycle and checkpoint endpoints

Base: `/api/projects/:projectId/lifecycle`

- `GET /graph`: the current dependency-closed artifact manifest
- `GET /checkpoints`: checkpoint list, newest first, without manifest bodies
- `POST /checkpoints` (body: optional `tag`, optional `message`)
- `GET /checkpoints/:checkpointId`: one checkpoint including its manifest
- `GET /checkpoints/:checkpointId/diff` (optional query: `against`)
- `POST /checkpoints/:checkpointId/restore` (body: `confirmContentHash`)

A manifest is deterministic: artifacts are emitted in dependency order and
hashed with a canonical JSON encoding, so an unchanged project always produces
the same `contentHash`. Building a manifest fails if an artifact depends on
something outside the project.

`diff` compares the checkpoint with another checkpoint when `against` is a
checkpoint ID, and with the live project state when `against` is `current` or is
omitted. It returns `added`, `removed`, and `changed` artifact references plus an
`unchanged` count.

Restore semantics:

- `confirmContentHash` must equal the checkpoint's stored hash, otherwise the
  request fails with `400`. This is what makes a restore an explicit act rather
  than an accidental one.
- The stored manifest is re-hashed before anything is written. A per-artifact or
  root hash that no longer matches fails with `409` and writes nothing, so a
  tampered or corrupted checkpoint cannot be applied.
- The restore runs in a single transaction. It rewrites project artifacts and
  the project name/description only.
- Membership, project roles, and sharing are **not** restored. Recovering an
  old graph must never resurrect a removed collaborator's access.
- Checkpoints are immutable and are not deleted by a restore, so restoring to an
  older checkpoint is itself reversible.
- The restored graph's root hash equals the checkpoint hash.

Capabilities: `checkpoint.create` (DSL_DESIGNER and above) and
`checkpoint.restore` (OWNER only).

## Metamodel evolution endpoints

Base: `/api/projects/:projectId/metamodels/:id/evolution`

- `POST /preview` (body: `nextMetamodel`, optional `rules`)
- `POST /apply` (body: `nextMetamodel`, `expectedSourceHash`, optional `rules`,
  optional `checkpointTag`, optional `message`)
- `GET /migrations`

`preview` compares the stored metamodel with `nextMetamodel` by stable class and
feature IDs and returns a report with:

- `changes[]`: each with a `kind`, the `classId`/`featureId`, before/after
  fragments, and a `breaking` flag;
- `impacts[]`: affected models, viewpoints, transformations, generators, and
  tests with the reasons they are affected;
- `blockers[]`: conditions that prevent an apply until an explicit rule covers
  them, such as removing a class that still has instances; and
- `warnings[]`: non-blocking notes.

Preview never mutates anything.

`apply` requires `expectedSourceHash` from the preview. If the metamodel changed
in between, the request fails with `409` rather than migrating against a stale
plan. Before mutating, it creates a Phase 11 checkpoint and records its ID as the
migration's `sourceCheckpointId`, so any migration can be rolled back with the
restore endpoint. Metamodel and model changes are applied in one transaction.

Migration rules are explicit: `rename-attribute`, `remove-attribute`, and
`remove-class`. An unsafe deletion without a matching rule is rejected.

Capability: `metamodel.evolve` (DSL_DESIGNER and above). Reading migration
history needs only `project.read`.

## Pipeline endpoints

Base: `/api/projects/:projectId/pipelines`

- `GET /runs`
- `GET /runs/:runId`
- `POST /runs` (body: `name`, `steps[]`, optional `checkpointTag`)

Step kinds:

| Kind | Required fields |
| --- | --- |
| `validate-model` | `id`, `modelId` |
| `apply-transformation` | `id`, `modelId`, `ruleId`, optional `maxIterations` |
| `run-tests` | `id`, `modelId` |
| `generate` | `id`, `modelId`, `codegenProjectId` |

Run semantics:

- A source checkpoint is captured before the first step, so every run records
  exactly which project state it executed against.
- Steps run in the given order and stop at the first failure. Completed step
  results are still retained on a failed run.
- Every run gets a deterministic `contentHash` over its source checkpoint hash,
  its normalized definition, and its step results. The same checkpoint and
  definition reproduce the same hash, which is what makes a run comparable
  across environments.
- A failed run returns HTTP `201` with `status: "FAILED"` and a
  `failureMessage`. The HTTP status describes the request, not the model
  outcome; read `status` to decide whether the run passed.

Capability: `pipeline.execute` (MODELER and above).

## Admin endpoints

Base: `/api/admin` (ADMIN role required)

User management:

- `GET /users`
- `GET /users/:userId`
- `PATCH /users/:userId/role`
- `POST /users/:userId/reset-password`
- `DELETE /users/:userId`
- `POST /users/bulk/role`
- `POST /users/bulk/delete`

Resource and system:

- `GET /stats`
- `GET /resources`
- `GET /resources/:type/:resourceId`
- `DELETE /resources/:type/:resourceId`
- `POST /resources/:type/:resourceId/transfer`
- `POST /resources/:type/:resourceId/unshare`
- `GET /health`

## Role/permission summary

- Auth middleware protects all non-public route groups.
- Resource operations are further constrained by role and ownership/share checks.
- Sharing creation is restricted to allowed roles and owner verification.

On project-scoped routes, authority comes from project membership rather than
the platform role. Capabilities accumulate by role:

| Project role | Adds |
| --- | --- |
| `VIEWER` | `project.read` |
| `MODELER` | model/view create, update, delete; `transformation.execute`; `codegen.execute`; `test.execute`; `pipeline.execute` |
| `DSL_DESIGNER` | metamodel and viewpoint authoring; `transformation.author`; `codegen.author`; `test.author`; `checkpoint.create`; `metamodel.evolve` |
| `OWNER` | `project.settings.update`; `project.members.manage`; `project.archive`; `checkpoint.restore` |

A platform `ADMIN` receives the owner capability set on any project. A missing
capability returns `403`; an artifact outside the addressed project returns
`404`.

## Related docs

- [Project Lifecycle](../user-guide/project-lifecycle.md)
- [Roles and Sharing](../user-guide/roles-and-sharing.md)
- [Data Model](data-model.md)
