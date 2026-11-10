# Phase 5: Hardening and Cleanup

Goal: make `projectId` mandatory, support moving artifacts between projects, finish
admin tooling, seed/demo/docs, and remove interim tolerances introduced in Phases 2-3.

Depends on: Phases 1-4 live and stable; backfill verified complete in all environments.

## 0. Reconcile with the shipped code first

This phase was written in July, before Phases 1 to 3 shipped. Checked against `main` on 2026-11-09:

- **Nine scoped tables, not seven.** `EPackage` and `StoredFile` also have an optional `projectId`, alongside `Metamodel`, `Viewpoint`, `Model`, `Diagram`, `TransformationRule`, `CodeGenerationProject` and `TestCase`. The audit in §1 and the hardening scope must cover all nine. Reconcile the exclusions in master plan D6, Phase 1 §1.2 and §6 below.
- **Moves must carry the metamodel's `EPackage`.** `project-checkpoint.service.ts` rejects a manifest that references an artifact outside the project, so the closure in §2 has to move the package, or clone and rebind it, and handle packages shared between metamodels and name clashes in the destination. Test the dependency closure of both projects.
- **§4 has shipped.** List routes already filter by `req.projectContext.projectId`, and #44 removed the all-project fallback. Treat server-side scoping as the baseline that any later change must keep.

## 1. Make `projectId` required

Precondition audit script (extend `backend/scripts/migrate-projects.ts` with `--verify`):
report any row in the 7 scoped tables with `projectId IS NULL`, excluding `isExample`
template packs (decision Q3).

Then either:

- **Option A (recommended)**: keep the column nullable in SQL but enforce NOT NULL in the
  service layer for all creates/updates, and exempt `isExample` packs. Cheaper, no
  exemption gymnastics in the schema.
- **Option B**: Prisma migration to `projectId String` NOT NULL on
  Metamodel/Model/Diagram/Viewpoint (the FK-linked tables where backfill is provably
  complete), keeping loose-reference tables (CodeGenerationProject, TestCase,
  TransformationRule) nullable.

Remove the Phase 3 null-tolerance in `assertSameProject` for the tables made mandatory.

## 2. Move artifacts between projects

New endpoints (owner or admin; project OWNER member for the destination):

- `POST /projects/:id/move` `{ resourceType, resourceIds: string[] }`.
- Rule: moving must preserve the same-project invariant, so moves operate on the
  **conformance closure**:
  - Moving a **metamodel** moves its models, diagrams, and viewpoints with it (compute
    the closure, show it, move atomically in a transaction). Codegen packs/test
    cases/rules that resolve to it are moved too.
  - Moving a **model** alone is allowed only to a project already containing its
    metamodel; its diagrams move with it.
  - Moving a **diagram/viewpoint/rule/test case/template pack** alone follows the same
    parent-must-exist-in-target rule.
- Frontend: "Move to project..." action on list items; confirmation dialog lists the
  closure ("This will also move 3 models and 7 views").
- Direct `SharedResource` shares on moved artifacts are preserved (they are id-based);
  membership-derived access changes implicitly. The confirmation dialog warns when a move
  will change who can see the artifacts.

## 3. Admin tooling

- Admin resource inventory (`backend/src/routes/admin.routes.ts`, `/resources` ~line 243):
  add project name/id column and a project filter; the transfer endpoint (~line 320)
  gains project-aware semantics (transferring ownership does not change project).
- Admin panel UI (`frontend/src/.../AdminPanel`): show projects per user, orphan report
  (anything still null), and a button to run the `--verify` audit.

## 4. Server-side list filtering (performance, optional but planned)

Phase 2 filters client-side. Add `?projectId=` support to the list endpoints and pass the
current project from the frontend service caches, so large tenants stop shipping full
lists. Keep client-side filtering as fallback. This also positions the caches to be
per-project later if memory becomes an issue.

## 5. Seed, demo, docs

- `backend/prisma/seed.ts`: create a "Demo" project for the demo user; any future demo
  content seeds into it.
- Update README / docs pages that describe metamodel/model/view workflows to introduce
  the Project concept, the conformance rule, and project sharing.
- UI relabel sweep for decision D1: every user-facing "Project" string in the code
  generation area becomes "Template Pack" (components under
  `frontend/src/components/codegeneration/`: `ProjectsTab`, `ProjectSelector`,
  `useProjectManagement` UI strings; internal identifiers can keep their names).

## 6. Cleanup of interim behavior

- Remove the Phase 2 interim rule that parked non-owned items under "All projects"
  (superseded by Phase 4 membership) if any remnant remains.
- Revisit cascade sharing removal (`shareResourceWithCascade`): if telemetry/user
  feedback shows project sharing has replaced it, delete the dependency-walking code and
  its tests; otherwise keep and re-evaluate later.
- Decide open question Q4 (EPackage/StoredFile scoping) with real usage data; out of
  scope here.

## 7. Tests and acceptance

- Move-closure tests: metamodel move takes the full cluster atomically; illegal single
  moves rejected; transaction rollback on partial failure.
- NOT NULL enforcement tests per chosen option.
- Seed test: fresh `db:reset && prisma:seed` yields a working demo project.

Acceptance:

- [ ] `--verify` reports zero unexpected null-project rows in production.
- [ ] New artifacts cannot be created without a project anywhere in the API surface.
- [ ] A metamodel cluster can be moved between projects atomically from the UI.
- [ ] Admin panel shows and filters by project.
- [ ] Codegen UI says "Template Pack" everywhere users see it.

## 8. Rollback

Each item here is independently revertable; Option A NOT NULL enforcement is
service-layer only (no migration to unwind). The move endpoints are additive.
