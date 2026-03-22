# Data Model

Persistent schema is defined in Prisma and stored in PostgreSQL.

## Design approach

The data model combines:

- relational ownership and foreign keys for core lineage
- JSON/JSONB-style fields for flexible metamodel/model/diagram structures
- explicit share records for cross-user collaboration

## Core entities

### User

Represents authenticated users and role assignment.

Key fields:

- `id`, `email`, `password`
- `role` (`ADMIN`, `DSL_DESIGNER`, `MODELER`, `VIEWER`)
- `isSuspended`, `lastLogin`

Owns all primary resources through `userId` relations.

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
- `constraints` (JSON)
- `conformsToId` (EPackage FK)
- `userId`

### Model

Instance-level data conforming to a metamodel.

Key fields:

- `name`
- `metamodelId` (duplicate convenience field)
- `elements` (JSON)
- `connections` (JSON)
- `conformsToId` (Metamodel FK)
- `userId`

### Diagram

Visual representation bound to a model.

Key fields:

- `name`
- `modelId` (Model FK)
- `elements` (JSON)
- `gridSettings` (JSON)
- `userId`

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

- `UserRole`: ADMIN, DSL_DESIGNER, MODELER, VIEWER
- `ResourceType`: METAMODEL, MODEL, DIAGRAM, TRANSFORMATION_RULE, CODEGEN_PROJECT, TEST_CASE
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

## Sharing model

Shared access is represented explicitly in `SharedResource`.

Semantics:

- owner defines recipient and permission
- effective access combines recipient role and share permission
- only one row per `(resourceType, resourceId, sharedWithId)`

## Dependency relationships

Main dependency chain:

- `EPackage` -> `Metamodel` -> `Model` -> `Diagram`

Additional dependency links:

- `CodeGenerationProject.targetMetamodelId` (optional)
- transformation and test resources linked by domain identifiers and ownership

## JSON-backed structures

JSON fields are used for flexible domain objects:

- class definitions
- model elements and connections
- diagram elements and grid config
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

## Related docs

- [API Reference](api.md)
- [Architecture](architecture.md)
