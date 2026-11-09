# Phase 2: Frontend Project Scope (read side)

Goal: a project selector in the sidebar; all list pages filter to the current project;
grouping colors re-keyed from metamodel to project. Creation flows are untouched (Phase
3). "All projects" preserves today's behavior and is the default.

Depends on: Phase 1 deployed and backfill run (lists rely on `projectId` being populated).

## 1. Frontend project service

New `frontend/src/services/project/project.service.ts`, mirroring the structure of
`frontend/src/services/metamodel/metamodel.service.ts` (singleton, in-memory cache,
`clearCacheAndReinitialize()`).

- Add `PROJECTS: '/projects'` to `API_ENDPOINTS` in
  `frontend/src/services/core/api.client.ts` (~line 260).
- Methods: `getAllProjects()`, `getProject(id)`, `createProject`, `updateProject`,
  `deleteProject` (create/update/delete are used by the management UI in section 5;
  creation itself is Phase 1 API, already available).
- Register the service in `clearAllServiceCaches()` in
  `frontend/src/contexts/AuthContext.tsx` so projects load at login like everything else.

## 2. Types

Add `projectId?: string | null` to `Metamodel`, `Model`, `Diagram`, `Viewpoint`,
`TransformationRule`, `CodeGenerationProject`, `TestCase` in
`frontend/src/models/types.ts`, and add the `Project` interface (mirror `shared/types`).

## 3. CurrentProjectContext

New `frontend/src/contexts/CurrentProjectContext.tsx`, modeled directly on
`OwnerFilterContext.tsx` (same provider + matcher-hook shape):

```tsx
interface CurrentProjectContextValue {
  currentProjectId: string | null;   // null = "All projects"
  setCurrentProjectId: (id: string | null) => void;
  projects: Project[];               // from projectService cache
  refreshProjects: () => Promise<void>;
}
```

- Persist `currentProjectId` to `localStorage` keyed by user email, so the selection
  survives reloads but never leaks across accounts (same concern the owner-filter matcher
  guards against, `OwnerFilterContext.tsx:29-33`). Validate the stored id against the
  loaded project list; fall back to null if stale.
- Matcher hook, used identically to `useOwnerFilterMatcher`:

```tsx
export const useProjectFilterMatcher = (): ((r: { projectId?: string | null }) => boolean) => {
  const { currentProjectId } = useCurrentProject();
  return useCallback(
    (r) => currentProjectId === null || r.projectId === currentProjectId,
    [currentProjectId]
  );
};
```

- Mount `CurrentProjectProvider` in `App.tsx` next to `OwnerFilterProvider` (~lines
  186-190): `AuthProvider > OwnerFilterProvider > CurrentProjectProvider > app`.

## 4. Sidebar project selector

New `frontend/src/components/common/ProjectSelectorControl.tsx`, mounted in
`frontend/src/components/layout/Sidebar.tsx` above the nav items (near where
`OwnerFilterControl` renders for admins).

- A `Select` listing "All projects" + the user's projects, each with its color dot
  (`project.color`).
- Shows for every authenticated user (unlike the admin-only owner filter).
- Collapsed sidebar: show only the color dot with a tooltip.
- Switching projects does NOT need cache invalidation: caches hold the full accessible
  set and filtering is client-side, exactly like the owner filter. (Server-side
  `?projectId=` filtering is a later optimization, noted in Phase 5.)

## 5. Minimal project management UI

A small management surface so users can rename/recolor projects before Phase 3 makes
projects load-bearing for creation:

- "Manage projects" entry point from the selector (gear icon) opening a dialog:
  list, create, rename, change color, delete (delete surfaces the backend 409 for
  non-empty projects). Color editing reuses `ColorSwatchField.tsx`.
- Defer anything fancier (project overview page with content counts via
  `/projects/:id/contents`) unless it falls out naturally.

## 6. Apply the filter on every list page

Apply `const matchesProject = useProjectFilterMatcher()` exactly where `matchesOwner` is
applied today (compose: `items.filter(m => matchesOwner(m) && matchesProject(m))`):

| Page / component | Where the owner filter sits today |
|---|---|
| `frontend/src/components/metamodel/MetamodelManager.tsx` | ~line 201 |
| `frontend/src/components/model/ModelManager.tsx` | analogous filter |
| `DiagramsPage` (inline in `frontend/src/App.tsx`) | ~line 1442 |
| `ViewpointsPage`, `RepresentationsPage` (inline in `App.tsx`) | analogous |
| Codegen `ProjectsTab.tsx` / `ExampleTemplatesTab.tsx` | filter template packs by `projectId`; `isExample` packs (null projectId) always show under Examples |
| `TransformationDashboard` | rules list |
| `ModelBasedTestingDashboard` | test case list |
| `HomePage` summary counts (inline in `App.tsx`) | recompute against filtered lists |

Artifacts with `projectId = null` (possible until Phase 5) are visible only under
"All projects", except `isExample` template packs which always show.

## 7. Re-key grouping colors

`frontend/src/services/common/grouping.service.ts`:

- `getParentGroupColor(parentId)` stays as the fallback hash, but callers pass the
  **project id** (and prefer `project.color` when set) instead of the metamodel id.
- `groupByParent(items, getParentId, getParentName)` calls at the usage sites
  (`ModelManager.tsx` ~line 35, `App.tsx` DiagramsPage/ViewpointsPage/RepresentationsPage,
  codegen tabs) switch the key from metamodel to project. Because the Phase 1 backfill
  copied the metamodel-hash color onto each project, colors are visually unchanged for
  migrated data.
- With a specific project selected, the group header is redundant (single group);
  collapse to a flat list, and group by project only in "All projects" view. Within a
  selected project, optionally keep a secondary grouping by metamodel for Models/Views
  lists (decide during implementation; cheap either way since `groupByParent` is generic).

## 8. Shared-with-me placement (open question Q1)

Artifacts shared directly with me live in someone else's project I may not be a member
of. Until Phase 4 membership lands: under a specific project they would vanish from
lists. Resolution for this phase:

- Mount the existing orphaned `frontend/src/components/common/SharedWithMe.tsx` as a
  proper route (`/shared-with-me`) + sidebar item, so direct shares are always reachable.
- Additionally, `useProjectFilterMatcher` keeps items with `isOwner === false` visible
  under "All projects" only. Document this as interim behavior; Phase 4 replaces it with
  real membership.

## 9. Tests and acceptance

- Component tests: `ProjectSelectorControl` (renders projects, persists selection,
  stale-id fallback), `useProjectFilterMatcher` (null = all, id filters, missing
  projectId hidden).
- Manual smoke: log in as demo user post-backfill; each former color-cluster appears as a
  project; switching projects narrows every tab; "All projects" matches pre-change
  behavior; admin owner filter still composes correctly with the project filter.

Acceptance:

- [ ] Selector visible for all roles; selection persists per user across reloads.
- [ ] Every list page respects the current project; Home counts follow.
- [ ] Colors stable vs. pre-migration for migrated clusters.
- [ ] "Shared with me" route reachable; direct shares not lost.
- [ ] No change to any create/edit flow yet.

## 10. Rollback

Frontend-only phase: revert the frontend changes. No data impact.
