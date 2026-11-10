# Phase 4: Project-Level Access Control

Goal: project membership grants access to everything in the project; a "share project"
flow replaces cascade sharing for new shares. Highest-risk phase (touches authorization);
ships after Phase 3 and gets the deepest test coverage.

Depends on: Phase 1 (schema + membership backfill). Phases 2-3 should be live first.

## 1. Semantics

Effective permission on an artifact = the **maximum** of:

1. Ownership (`artifact.userId === userId`) -> full control (as today).
2. Direct share (`SharedResource` row) -> VIEWER or EDITOR (as today).
3. **New: project membership** (`ProjectMember` row on `artifact.projectId`) ->
   VIEWER or EDITOR; OWNER membership behaves like EDITOR on contents plus project
   management rights (rename, members, delete-when-empty).
4. Admin bypass (as today, `sharing.service.ts:516-527`).

Only owners/admins may delete artifacts (unchanged). Sharing an individual artifact
remains possible (override/escape hatch) but the UI steers toward sharing the project.

Role gate: project sharing follows the existing rule that only ADMIN/DSL_DESIGNER may
share (`sharing.service.ts:51-53`).

## 2. Backend changes

### 2.1 `ResourceType.PROJECT`

Add `PROJECT` to the `ResourceType` enum in `schema.prisma:24-31` (Prisma migration,
enum-value addition only) and to the `ResourceType` unions in `shared/types` and
`frontend/src/services/common/sharing.service.ts`. Extend
`sharingService.getResourceOwnerId()` switch (`sharing.service.ts:558-604`) with the
PROJECT case.

Note: project sharing itself is implemented via `ProjectMember`, not `SharedResource`
rows; the enum value exists so `checkAccess('PROJECT', ...)`, the admin resource
inventory, and the share routes have a uniform vocabulary.

### 2.2 `sharingService.checkAccess()` (`sharing.service.ts:473-530`)

After the direct-share lookup and before the admin bypass, add the membership path:

```
artifact = load(resourceType, resourceId)            // already loaded for owner check
if (artifact.projectId) {
  member = prisma.projectMember.findUnique({ projectId+userId })
  if (member) return { hasAccess: true, permission: member.role === 'VIEWER' ? 'VIEWER' : 'EDITOR', via: 'PROJECT' }
}
```

Return a `via` discriminator (`'OWNER' | 'SHARE' | 'PROJECT' | 'ADMIN'`) so the UI can
display provenance. Update `getEffectivePermission` in
`backend/src/middleware/permissions.ts:53-104` to flow through unchanged (it delegates to
checkAccess).

### 2.3 List merges: every service `getAll()`

Extend the owned + shared merge with a third source, membership
(canonical example `model.service.ts:22-78`):

```
memberProjectIds = prisma.projectMember.findMany({ where: { userId } }).map(projectId)
memberRows = prisma.model.findMany({ where: { projectId: { in: memberProjectIds }, userId: { not: userId } } })
```

Tag rows with `permission` from the membership role and `via: 'PROJECT'`; dedupe against
direct shares (direct share wins if higher). Services to touch: metamodel, model,
diagram, viewpoint, transformation, codegeneration, test (7 `getAll` implementations).
Consider extracting the whole owned+shared+member merge into one generic helper since the
logic is now duplicated 7 times with three sources each; do this refactor first, with
tests, then add the membership source once.

### 2.4 Member management API

`backend/src/routes/project.routes.ts` additions, service logic in `project.service.ts`:

| Method | Path | Rule |
|--------|------|------|
| GET | `/projects/:id/members` | any member, owner, or admin |
| POST | `/projects/:id/members` `{ email, role }` | project OWNER member, project owner, or admin; ADMIN/DSL_DESIGNER platform role required |
| PUT | `/projects/:id/members/:userId` `{ role }` | same |
| DELETE | `/projects/:id/members/:userId` | same; a member may remove themselves |

Guard: the project owner cannot be demoted/removed.

### 2.5 Cascade sharing deprecation

`shareResourceWithCascade` (`sharing.service.ts:167-389`) stays functional for the
existing per-object share flow, but:

- New UI copy points users to project sharing.
- When a share request targets an artifact whose project the recipient is already a
  member of, return a warning ("already has access via project").
- Plan removal of the cascade walk in a later cleanup once project sharing is the norm
  (not in this phase).

### 2.6 Project write-access for creation (upgrade of Phase 3 rule)

Phase 3 allowed creating into a project the user owns. Now: OWNER/EDITOR members may also
create artifacts in the project (still subject to platform role checks via
`canPerformOperation`). VIEWER members may not. Update the Phase 3 resolution helper.

## 3. Frontend changes

- **ProjectShareDialog**: modeled on `frontend/src/components/common/ShareDialog.tsx`
  (add by email, role select OWNER/EDITOR/VIEWER, list + remove members). Entry points:
  the project selector's manage dialog and a Share action on the project.
- **Existing ShareDialog**: add an info banner "Sharing the whole project gives access to
  all its contents" with a link to the project share flow.
- **Provenance display**: lists already show `isOwner`/`ownerEmail`; extend
  `CreatedBy.tsx`/list chips to show "via project" vs "shared directly" using the new
  `via` field.
- **Shared-with-me**: with membership live, shared projects now appear in the project
  selector (they come back from `/projects` via the membership path built in Phase 1).
  The interim Phase 2 rule ("non-owned items visible only under All projects") is
  removed; items are visible under their project for members, and `SharedWithMe.tsx`
  remains for direct shares only.

## 4. Tests (this phase must be the best-tested)

Backend authorization matrix test, for each artifact type x each access path:

| Actor | Expect |
|---|---|
| owner | full |
| direct-share VIEWER / EDITOR | view / edit |
| project member VIEWER / EDITOR / OWNER | view / edit / edit |
| member of a DIFFERENT project | **no access** |
| non-member, non-shared | no access |
| admin | full |
| direct share EDITOR + membership VIEWER | edit (max wins) |
| VIEWER member trying to create in project | 403 |

Plus: member CRUD rules (owner not removable, self-removal), `getAll` merge dedupe,
regression run of every existing sharing/permission test (none may change semantics
except where a new access path legitimately grants more).

## 5. Acceptance criteria

- [ ] Adding a member by email gives them the whole project's contents in every tab, at
      the granted level, without any per-object shares.
- [ ] Removing the member revokes all of it immediately.
- [ ] Existing per-object shares keep working unchanged (verified against pre-phase
      fixtures).
- [ ] Cross-project members gain nothing outside their project.
- [ ] Authorization matrix suite green.

## 6. Rollback

Revert code; `ProjectMember` rows are inert without the checkAccess/getAll code paths
(exactly the Phase 1-3 state). The `PROJECT` enum value can stay (additive).
