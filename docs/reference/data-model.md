# Data Model

Persistent schema is defined in Prisma and stored in PostgreSQL.

## Design approach

The data model combines:

- relational ownership and foreign keys for core lineage
- JSON/JSONB-style fields for flexible metamodel/model/view structures
- explicit share records for cross-user collaboration

## Core entities

### User

Represents authenticated users and role assignment.

Key fields:

- `id`, `email`, `password`
- `role` (`ADMIN`, `DSL_DESIGNER`, `MODELER`, `VIEWER`)
- `isSuspended`, `lastLogin`

Owns all primary resources through `userId` relations.

### StudioProject

Workspace, navigation context, and authorization boundary. Every modeling
artifact carries a `projectId` and belongs to exactly one project.

Key fields:

- `name`, `description`
- `status` (`ACTIVE`, `ARCHIVED`)
- `ownerId` (restricted delete, so a project cannot be orphaned)

Deleting a project cascades to its memberships, artifacts, checkpoints,
migrations, and pipeline runs.

### ProjectMembership

Grants a user a role inside one project.

Key fields:

- `projectId`, `userId`
- `role` (`OWNER`, `DSL_DESIGNER`, `MODELER`, `VIEWER`)

Unique on `(projectId, userId)`, so a user holds at most one role per project.

### ProjectCheckpoint

Immutable, dependency-closed snapshot of a project's artifact graph.

Key fields:

- `sequence` (per-project, monotonically increasing)
- `tag`, `message`
- `manifest` (JSON: ordered artifact snapshots with per-artifact hashes)
- `contentHash` (canonical root hash of the manifest)
- `createdById`

Unique on `(projectId, sequence)` and on `(projectId, tag)`. Manifests
deliberately exclude membership and sharing state, so restoring a checkpoint
never restores access.

### MetamodelMigration

Evidence for an applied language-evolution operation.

Key fields:

- `metamodelId`, `sourceHash`, `targetHash`
- `status` (`APPLIED`, `FAILED`)
- `changeSet`, `impactReport`, `migrationReport` (JSON)
- `sourceCheckpointId` (restricted delete: the recovery checkpoint for this
  migration cannot be removed while the record refers to it)

### PipelineRun

Retained result of a headless pipeline execution.

Key fields:

- `name`, `status` (`RUNNING`, `SUCCEEDED`, `FAILED`)
- `definition`, `result` (JSON)
- `sourceCheckpointId` (nulled if the checkpoint is removed)
- `contentHash` (deterministic hash over source checkpoint, definition, and step
  results)
- `failureMessage`, `startedAt`, `completedAt`

### SharedResource

Maps owner resource access to recipient users.

Key fields:

- `resourceType`, `resourceId`
- `permission` (`VIEWER`, `EDITOR`)
- `ownerId`, `sharedWithId`

Unique constraint prevents duplicate share rows per resource/user pair.

### EPackage

Meta-metamodel package (Ecore-like foundation).

Key fields:

- `name`, `nsURI`, `nsPrefix`
- `classes` (JSON)
- `userId`

### Metamodel

User-defined modeling language.

Key fields:

- `name`, `uri`, `prefix`, optional `eClass`
- `classes` (JSON)
- `enums` (JSON)
- `constraints` (JSON)
- `conformsToId` (EPackage FK)
- `userId`

Metaclass JSON can include concrete syntax metadata for class-level 2D/3D notation. Reference JSON can include edge notation metadata. This is fallback notation; role-specific or representation-specific notation belongs in a Viewpoint representation description.

### Viewpoint

Definition-level modeling perspective for one metamodel, aligned with Sirius Viewpoint terminology.

Key fields:

- `name`, optional `description`
- `metamodelId` (Metamodel FK)
- `representationDescriptions` (JSON)
- `sharedConcreteSyntax` (JSON)
- `isDefault`
- `userId`

Viewpoints are not concrete user views. They define available representation kinds, visible concepts, creatable concepts, notation overrides, edge mappings, pin mappings, and palette/tool definitions. Representation descriptions are embedded JSON in the first implementation.

These records are SpatialDSL specification data. They are aligned with Sirius terminology, but they are not serialized as Sirius `.odesign` files.

### Model

Instance-level data conforming to a metamodel.

Key fields:

- `name`
- `metamodelId` (duplicate convenience field)
- `elements` (JSON)
- `connections` (JSON)
- `conformsToId` (Metamodel FK)
- `userId`

Model elements own canonical presentation metadata:

- 2D and 3D position
- 2D and 3D size
- rotation
- optional instance-level appearance override
- optional attachment metadata for pin-like nodes (`attachedToElementId`, side, offset ratio)

Views project this data rather than duplicating it.

### Diagram / View

Compatibility resource representing a view bound to a model. The database table and API still use `Diagram`; user-facing UI labels increasingly use `View`.

Key fields:

- `name`
- `modelId` (Model FK)
- optional `viewpointId`
- optional `representationDescriptionId`
- `includedElementIds` (JSON)
- `gridSettings` (JSON)
- `schemaVersion`
- `migrationWarnings`
- `elements` (legacy JSON kept for compatibility)
- `userId`

Notation resolution order is instance override, representation description, viewpoint shared defaults, metaclass fallback, then built-in fallback.

Diagram/View records are not Sirius `.aird` representation files. They are SpatialDSL view resources backed by model membership and presentation data.

### TransformationRule

Transformation rule with embedded patterns.

Key fields:

- `name`, `description`, `priority`, `enabled`
- `lhs` (JSON), `rhs` (JSON), `nacs` (JSON)
- `conditions` (JSON)
- optional `diagramId`
- `userId`

### CodeGenerationProject

Project-level container for codegen templates.

Key fields:

- `name`, `description`, `isExample`
- optional `targetMetamodelId`
- `templates` (JSON)
- `userId`

### TestCase

Model/metamodel testing definition and status tracking.

Key fields:

- `name`, `description`, `type`, `status`
- target class/property fields
- optional constraint fields
- `testValues` (JSON)
- optional `modelId`
- `userId`

### StoredFile

Binary file storage in database.

Key fields:

- `filename`, `mimetype`, `size`, `type`
- `data` (Bytes)
- `metadata` (JSON)
- `userId`

## Enums and domain vocabulary

- `UserRole`: ADMIN, DSL_DESIGNER, MODELER, VIEWER (platform-wide)
- `ProjectRole`: OWNER, DSL_DESIGNER, MODELER, VIEWER (per project membership)
- `ProjectStatus`: ACTIVE, ARCHIVED
- `MetamodelMigrationStatus`: APPLIED, FAILED
- `PipelineRunStatus`: RUNNING, SUCCEEDED, FAILED
- `ResourceType`: METAMODEL, MODEL, DIAGRAM, TRANSFORMATION_RULE, CODEGEN_PROJECT, TEST_CASE (`DIAGRAM` is the compatibility resource type for views)
- `SharePermission`: VIEWER, EDITOR
- `TestCaseType`: attribute, reference, constraint, reference_attribute
- `TestCaseStatus`: pending, running, passed, failed
- `ConstraintType`: ocl, javascript
- `FileType`: image, model, other

## Ownership and user isolation

Primary resources include `userId` ownership.

Isolation model:

- owners can fully manage owned resources
- cross-user access is only through sharing records
- cascade deletes on some relations enforce cleanup

## Project scoping

Every primary resource also carries `projectId`. Project membership, not the
platform role, decides what a user may do inside a project, and `userId` remains
on each resource as creator attribution.

The one-project invariant means a resource is reachable only through its own
project's routes. Addressing an artifact through a different project's URL
returns `404` even when the caller is a member of both projects.

Existing users were migrated by giving each a private Legacy Project and
backfilling their owned artifacts into it, so no resource is left unscoped.

## Sharing model

Shared access is represented explicitly in `SharedResource`.

Semantics:

- owner defines recipient and permission
- effective access combines recipient role and share permission
- only one row per `(resourceType, resourceId, sharedWithId)`

## Dependency relationships

Main dependency chain:

- `StudioProject` -> every primary resource
- `EPackage` -> `Metamodel` -> `Viewpoint` -> `RepresentationDescription`
- `Metamodel` -> `Model` -> `Diagram/View`
- `Diagram/View` -> optional `Viewpoint` + `RepresentationDescription`

This chain is also the order in which a `ProjectCheckpoint` manifest serializes
artifacts, which is what makes its root hash deterministic.

Additional dependency links:

- `CodeGenerationProject.targetMetamodelId` (optional)
- transformation and test resources linked by domain identifiers and ownership

## JSON-backed structures

JSON fields are used for flexible domain objects:

- class definitions
- model elements and connections
- model element presentation and connections
- view membership and grid config
- transformation patterns
- template collections
- test values and IO snapshots

Implications:

- rapid schema evolution for modeling payloads
- fewer SQL-level constraints inside nested structures
- validation and consistency logic moved to service layer

## Migration history

Current migration set:

- `20260123031348_init`
- `20260123055303_make_target_metamodel_id_optional`
- `20260223024320_add_rbac_sharing`
- `20260321071500_sync_user_schema_for_auth`
- `20260401120000_add_password_reset_and_role_requests`
- `20260427000000_add_view_membership_to_diagrams`
- `20260525000000_add_metamodel_enums`
- `20260528000000_add_viewpoints`
- `20260608000000_add_resource_descriptions`
- `20260612000000_add_email_verification`
- `20260722000000_add_studio_project_scope`
- `20260723010000_add_mde_lifecycle`

## Related docs

- [API Reference](api.md)
- [Project Lifecycle](../user-guide/project-lifecycle.md)
- [Architecture](architecture.md)
- [Sirius Desktop Compatibility](sirius-compatibility.md)
