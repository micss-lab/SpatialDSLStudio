# Project Scoping: Master Plan

Status: in progress. Project-scoped workspaces (#41), the split of legacy projects into one per metamodel (#42) and refusing artifact requests without an active project (#44) have shipped. `projectId` is still optional on most artifact models, so Phase 5 is open. Check each phase against the code before resuming.
Created: 2026-07-12

## 1. Motivation

Today every list page (Metamodels, Models, Views, Viewpoints, Code Generation, ...) shows
everything the user has access to, and admins see everything on the platform. The only
visual grouping is the frontend color hash keyed by parent metamodel
(`frontend/src/services/common/grouping.service.ts`), which means "metamodel" is already the
de-facto grouping unit, it just has no backend entity and no enforcement.

We introduce a **Project** as a first-class scoping entity:

- A project contains metamodels, models, views (diagrams), viewpoints, transformation
  rules, codegen template projects, and test cases.
- With a project selected, list pages show only that project's artifacts.
- New artifacts are created inside the current project.
- A model can only conform to a metamodel **in the same project** (enforced server-side).
- Later: sharing a project grants access to everything inside it, replacing most of the
  per-object cascade sharing.

## 2. Current architecture (facts the plan builds on)

- PostgreSQL + Prisma. Single schema file `backend/prisma/schema.prisma`; migrations via
  Prisma Migrate (`backend/prisma/migrations/`); ad-hoc data-migration scripts in
  `backend/scripts/` wired as npm scripts (`migrate:views`, `migrate:appearance`,
  `migrate:viewpoints`). We follow both patterns.
- Entity graph: `EPackage <- Metamodel (conformsToId) <- Model (conformsToId) <- Diagram (modelId)`,
  plus `Viewpoint (metamodelId)` and `Diagram.viewpointId (SetNull)`. Loose string references
  (no FK): `CodeGenerationProject.targetMetamodelId`, `TestCase.modelId` (may hold a model
  OR metamodel id), `TransformationRule.diagramId`.
- Ownership: every artifact has `userId`. Access: `SharedResource` ACL table
  (per-object VIEWER/EDITOR), roles ADMIN/DSL_DESIGNER/MODELER/VIEWER, admin bypass in
  `sharingService.checkAccess()` (`backend/src/services/sharing.service.ts:473-530`).
- Every service `getAll()` duplicates the "admin: all; else owned + shared" merge
  (`backend/src/services/model.service.ts:22-78` is the canonical example).
- Cascade sharing walks the dependency chain manually
  (`sharing.service.ts:167-389`, `shareResourceWithCascade`).
- Frontend: no store library; React contexts only. `OwnerFilterContext.tsx` is the template
  for a scoping context. Service singletons cache lists, populated at login via
  `clearAllServiceCaches()` in `AuthContext.tsx`.

## 3. Key design decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | New entity is called **Project** (`projects` table). The existing `CodeGenerationProject` keeps its table but is relabeled **"Template Pack"** in the UI. | "Project" is the natural user-facing term. The codegen entity is a leaf artifact (template container), not a grouping; a UI relabel is cheap. |
| D2 | Explicit, denormalized `projectId` FK on each artifact table (Metamodel, Model, Diagram, Viewpoint, TransformationRule, CodeGenerationProject, TestCase). NOT derived through the conformance chain. | Loose string references break derivation; list queries stay single-table; consistency is enforced at write time instead (same-project validation). |
| D3 | `projectId` is **nullable during rollout** (Phases 1-4), tightened to required in Phase 5. `onDelete: SetNull` on the FK; deleting a non-empty project is blocked in the service layer. | Old and new code coexist during deployment; no accidental cascade wipes user data. |
| D4 | Access model: `Project` + `ProjectMember (projectId, userId, role OWNER/EDITOR/VIEWER)`. Membership grants that permission to all contained artifacts. Existing per-object `SharedResource` shares keep working as an override. | Project membership subsumes cascade sharing without breaking existing shares. Effective permission = max(ownership, direct share, project membership, admin bypass). |
| D5 | Migration strategy: **one project per metamodel cluster**. For each metamodel, create a project named after it; pull in its models, diagrams, viewpoints, and template packs targeting it. Unresolvable/orphan artifacts go to a per-user "Unassigned" project. | Matches the existing color grouping exactly, so users' mental picture survives. |
| D6 | `EPackage` and `StoredFile` stay **global (unscoped)** for now. | EPackages are Ecore infrastructure shared across metamodels; files are referenced from JSON blobs and hard to attribute. Revisit in Phase 5+. |
| D7 | "All projects" remains a selectable scope in the UI (and is the default for admins). | Preserves current behavior, keeps admin workflows functional, makes rollout non-breaking. |
| D8 | Server-side enforcement is the source of truth for the conformance rule (model.metamodel must share the model's project). Frontend filtering is UX only. | Frontend-only filtering is trivially bypassed via the API. |

## 4. Target data model (summary)

```prisma
enum ProjectRole { OWNER EDITOR VIEWER }

model Project {
  id          String  @id @default(uuid())
  name        String
  description String?
  color       String?          // hex; drives UI grouping color
  ownerId     String
  owner       User    @relation("ProjectOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members     ProjectMember[]
  // back-relations to all scoped artifact tables
  @@unique([ownerId, name])
  @@map("projects")
}

model ProjectMember {
  id        String      @id @default(uuid())
  projectId String
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      ProjectRole
  @@unique([projectId, userId])
  @@map("project_members")
}

// On each artifact table (Metamodel, Model, Diagram, Viewpoint,
// TransformationRule, CodeGenerationProject, TestCase):
projectId String?
project   Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)
```

`ResourceType` gains `PROJECT` in Phase 4 (project-level sharing).

## 5. Phase overview

| Phase | Deliverable | Risk | User-visible? | Doc |
|-------|-------------|------|---------------|-----|
| 1 | Backend foundation: schema, `/projects` CRUD, backfill script | Low (additive only) | No | [phase-1](phase-1-backend-foundation.md) |
| 2 | Frontend project scope: selector, list filtering, project colors | Low | Yes (read-only grouping) | [phase-2](phase-2-frontend-project-scope.md) |
| 3 | Scoped creation + conformance enforcement (incl. imports) | Medium | Yes | [phase-3](phase-3-scoped-creation-and-conformance.md) |
| 4 | Project-level access control (membership, sharing UI) | High (touches auth) | Yes | [phase-4](phase-4-project-access-control.md) |
| 5 | Hardening: projectId NOT NULL, move-between-projects, seed, docs | Medium | Yes | [phase-5](phase-5-hardening-and-cleanup.md) |

Dependencies: strictly sequential 1 -> 2 -> 3; Phase 4 depends on 1 (not on 2/3) but should
ship after 3 to avoid confusing half-states; Phase 5 last. Phases 1-3 deliver the visible
grouping win without touching access control, which is where most of the risk lives; a
release can safely stop after Phase 3.

## 6. Rollout and safety

1. Each phase merges independently and deploys behind normal review; no feature flag is
   planned because Phases 1-2 are non-breaking by construction (nullable column, "All
   projects" default).
2. Backfill script is idempotent (skips rows that already have `projectId`) and is run once
   per environment after the Phase 1 deploy, before Phase 2 ships.
3. Database backup before running the backfill in production (same procedure as the
   viewpoints migration).
4. Rollback story per phase is in each phase doc; until Phase 5, dropping the new columns
   restores the exact previous behavior.

## 7. Open questions (decide before the phase that needs them)

| Q | Needed by | Options |
|---|-----------|---------|
| Q1 Shared-with-me placement: where do artifacts shared directly with me (not via project) appear? | Phase 2 | Recommended: a virtual "Shared with me" section outside the project scope (mount the existing orphaned `SharedWithMe.tsx`). |
| Q2 Should MODELER/VIEWER roles be allowed to create projects, or only ADMIN/DSL_DESIGNER? | Phase 1 | Recommended: ADMIN + DSL_DESIGNER only, matching who can create metamodels. |
| Q3 Do `isExample` template packs (global examples) belong to any project? | Phase 1 backfill | Recommended: leave `projectId = null` permanently for `isExample` rows; exempt them from the Phase 5 NOT NULL constraint or park them in a system project. |
| Q4 One EPackage per project later? | Phase 5+ | Out of scope for this plan. |

## 8. Testing strategy (cross-phase)

- Backend: extend the existing Jest suites in `backend/src/__tests__/services` and
  `__tests__/routes` per phase; every new access rule gets a positive and a negative test.
- Backfill: dry-run mode (`--dry-run`) printing the planned assignment table; unit test the
  cluster-resolution logic against fixture rows, including loose-reference orphans.
- Frontend: component tests for the project selector and filtered lists; manual smoke of
  the create-model flow with a project selected and with "All projects".
- End-to-end acceptance per phase is listed in each phase doc.
