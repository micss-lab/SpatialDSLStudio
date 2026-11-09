# Phase 1: Backend Foundation

Goal: introduce the `Project` entity, nullable `projectId` on all scoped artifacts, a
`/projects` CRUD API, and an idempotent backfill script. **Zero behavior change** for
existing endpoints: nothing filters by project yet.

Depends on: nothing. Blocks: all later phases.

## 1. Prisma schema changes (`backend/prisma/schema.prisma`)

### 1.1 New enum and models

```prisma
enum ProjectRole {
  OWNER
  EDITOR
  VIEWER
}

model Project {
  id          String   @id @default(uuid())
  name        String
  description String?
  color       String?   // hex color used by the frontend grouping
  isUnassigned Boolean  @default(false) // marks the per-user "Unassigned" bucket

  ownerId     String
  owner       User     @relation("ProjectOwner", fields: [ownerId], references: [id], onDelete: Cascade)

  members     ProjectMember[]

  metamodels          Metamodel[]
  models              Model[]
  diagrams            Diagram[]
  viewpoints          Viewpoint[]
  transformationRules TransformationRule[]
  codegenProjects     CodeGenerationProject[]
  testCases           TestCase[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([ownerId, name])
  @@map("projects")
}

model ProjectMember {
  id        String      @id @default(uuid())
  projectId String
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User        @relation("ProjectMemberships", fields: [userId], references: [id], onDelete: Cascade)
  role      ProjectRole

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([projectId, userId])
  @@map("project_members")
}
```

`ProjectMember` is created now (one migration instead of two) but is not read by any
access check until Phase 4.

### 1.2 New columns on artifact tables

Add to `Metamodel`, `Model`, `Diagram`, `Viewpoint`, `TransformationRule`,
`CodeGenerationProject`, `TestCase` (7 tables; `EPackage` and `StoredFile` intentionally
excluded, see master plan D6):

```prisma
  projectId String?
  project   Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([projectId])
```

`onDelete: SetNull` so a project row can never cascade-delete user artifacts; the service
layer blocks deleting non-empty projects anyway (see 3.3).

### 1.3 User relations

On `User` add:

```prisma
  ownedProjects      Project[]       @relation("ProjectOwner")
  projectMemberships ProjectMember[] @relation("ProjectMemberships")
```

### 1.4 Migration

`npx prisma migrate dev --name add_project_scoping`. Review the generated SQL: it must be
purely additive (CREATE TABLE x2, ALTER TABLE ADD COLUMN x7, indexes). No data change.

## 2. Shared types (`shared/types/index.ts`)

- `export interface Project { id; name; description?; color?; isUnassigned; ownerId; createdAt; updatedAt }`
- `export interface ProjectMemberInfo { userId; email; role: 'OWNER' | 'EDITOR' | 'VIEWER' }`
- `CreateProjectRequest`, `UpdateProjectRequest`.
- Add optional `projectId?: string | null` to the existing `Metamodel`, `Model`, `Diagram`,
  `Viewpoint`, `TransformationRule`, `CodeGenerationProject`, `TestCase` interfaces so the
  field flows through existing GET responses (services must map it in their `mapToX`
  helpers, e.g. `modelService.mapToModel`).

## 3. New service: `backend/src/services/project.service.ts`

Follow the structure of `model.service.ts`.

- 3.1 `getAll(userId)`: admin sees all projects; otherwise owned projects plus projects
  where the user has a `ProjectMember` row (the membership path returns data already in
  Phase 1 even though nothing writes members until the backfill/Phase 4; harmless).
  Return `isOwner`, `ownerEmail`, `memberRole` like `ResourceWithPermission`.
- 3.2 `create(data, userId, userRole)`: gate with `canPerformOperation` extended with a
  `project` resource (allow ADMIN + DSL_DESIGNER per open question Q2; add the row to
  `roleOperationPermissions` in `backend/src/middleware/permissions.ts:180-220`).
  Enforce the `@@unique([ownerId, name])` constraint with a friendly 409.
- 3.3 `update(id, data, userId)`: owner or admin only.
  `delete(id, userId)`: owner or admin only, and **reject with 409 if any artifact table
  has rows with this projectId** (count across the 7 tables). Message: "Move or delete the
  project's contents first."
- 3.4 `getContents(id, userId)`: counts per artifact type (used by the delete guard and
  later by the UI project overview).

## 4. New routes: `backend/src/routes/project.routes.ts`

Register in `backend/src/routes/index.ts` under `/projects` (inside the authenticated
block, `routes/index.ts:33-45`):

| Method | Path | Handler |
|--------|------|---------|
| GET | `/projects` | list accessible projects |
| GET | `/projects/:id` | single project (access-checked) |
| GET | `/projects/:id/contents` | artifact counts |
| POST | `/projects` | create |
| PUT | `/projects/:id` | update (name/description/color) |
| DELETE | `/projects/:id` | delete (empty projects only) |

Member routes (`/projects/:id/members`) are deferred to Phase 4.

## 5. Backfill script: `backend/scripts/migrate-projects.ts`

Wire as `"migrate:projects": "ts-node scripts/migrate-projects.ts"` in
`backend/package.json` next to the existing `migrate:*` scripts. Support `--dry-run`
(print the assignment plan, write nothing).

Algorithm (idempotent: every step skips rows where `projectId != null`):

1. **Per metamodel** (the cluster seed): create a project owned by `metamodel.userId`,
   named after the metamodel (`metamodel.name`), deduped within the owner via a numeric
   suffix ("Robots", "Robots (2)") because of `@@unique([ownerId, name])`. Set
   `project.color` from the same deterministic palette the frontend uses
   (`frontend/src/services/common/grouping.service.ts` palette; replicate the 10-color
   hash so existing colors are preserved). Assign `metamodel.projectId`.
2. **Models**: `model.projectId = project of model.conformsToId` (FK, always resolvable).
3. **Diagrams**: via `diagram.modelId -> model.projectId`.
4. **Viewpoints**: via `viewpoint.metamodelId` (FK).
5. **CodeGenerationProject**: resolve `targetMetamodelId` (loose string): if it matches an
   existing metamodel, use that project; if `isExample`, leave `projectId = null` (Q3);
   otherwise Unassigned (step 8).
6. **TransformationRule**: resolve `diagramId -> diagram.projectId` if present and
   resolvable; otherwise Unassigned.
7. **TestCase**: `modelId` may hold a model id or a metamodel id; try model first, then
   metamodel; otherwise Unassigned.
8. **Unassigned bucket**: lazily create one `Project { name: "Unassigned", isUnassigned: true }`
   per user that needs it.
9. **Membership backfill from existing shares**: for every `SharedResource` row of type
   `METAMODEL`, add `sharedWithId` as a `ProjectMember` of that metamodel's project with
   the mapped role (VIEWER->VIEWER, EDITOR->EDITOR), skipping duplicates. This writes rows
   that only take effect in Phase 4; doing it here means Phase 4 ships with data ready.
   Existing MODEL/DIAGRAM/etc. shares are left as-is (they keep working as direct shares).
10. Print a summary table: projects created, rows assigned per table, orphans sent to
    Unassigned, name collisions renamed.

Edge cases to handle explicitly:

- A user's models conforming to **someone else's** metamodel (possible via sharing): the
  model joins the metamodel owner's project by cluster rule. That means a project can
  contain artifacts owned by different users. This is intended (matches Phase 4
  semantics), but the script must log these cross-owner assignments for review.
- Metamodels with identical names under one owner: suffix dedupe (step 1).
- Dangling `conformsToId` is impossible (FK), but dangling loose references are expected;
  they land in Unassigned with a logged reason.

## 6. Tests

- `backend/src/__tests__/services/project.service.test.ts`: CRUD, role gating, non-empty
  delete rejection, unique-name conflict.
- `backend/src/__tests__/routes/project.routes.test.ts`: auth required, 403 for VIEWER
  create, owner-only update/delete.
- Backfill: factor the resolution logic (steps 1-9) into pure functions in the script file
  and unit test cluster assignment with fixture rows covering: shared-metamodel
  cross-owner model, orphan test case, isExample pack, duplicate metamodel names,
  re-run idempotency.
- Regression: run the existing full backend suite; no existing test should change, since
  no existing behavior changes.

## 7. Acceptance criteria

- [ ] Migration applies cleanly to a copy of production data; all existing endpoints
      return identical responses (plus a `projectId: null` field) before backfill.
- [ ] `migrate:projects --dry-run` on a production copy produces a sane assignment plan
      (spot-check the summary table).
- [ ] After backfill, every Metamodel/Model/Diagram/Viewpoint row has non-null
      `projectId`; loose-reference artifacts are either assigned or in Unassigned.
- [ ] Re-running the backfill is a no-op.
- [ ] `/projects` CRUD works per role matrix.

## 8. Rollback

Additive only: revert the code, then (optionally) a down migration dropping
`project_members`, `projects`, and the 7 `projectId` columns restores the previous state
exactly. No existing column is modified.
