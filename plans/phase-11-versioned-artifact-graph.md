# Phase 11: Versioned Artifact Graph

- Track: MDE lifecycle
- Status: Completed August 3, 2026
- Depends on: project-scoped workspaces
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (MDE lifecycle track, item 11)
- Reference: [docs/user-guide/project-lifecycle.md](../docs/user-guide/project-lifecycle.md)

## Goal

Make a Studio Project a versionable graph rather than a collection of mutable
latest-state records. A checkpoint captures a dependency-closed, immutable
manifest with stable hashes and can be compared with another checkpoint or the
current project.

## Scope

- Build a deterministic project artifact/dependency graph.
- Capture immutable tagged checkpoints with per-artifact and root hashes.
- List, inspect, and diff checkpoints.
- Restore project artifacts from a checkpoint without restoring membership or
  authorization state.
- Expose project-scoped REST endpoints and shared contracts.

## Implementation

- [x] Add checkpoint persistence and migration.
      (`ProjectCheckpoint`, migration `20260723010000_add_mde_lifecycle`)
- [x] Add deterministic canonical hashing and artifact graph collection.
      (`services/lifecycle/canonical.ts`,
      `services/lifecycle/project-checkpoint.service.ts`)
- [x] Add checkpoint create/list/get/diff/restore endpoints.
      (`routes/lifecycle.routes.ts`, mounted at
      `/api/projects/:projectId/lifecycle`)
- [x] Add service and route regression tests.
      (`__tests__/services/project-checkpoint.service.test.ts`,
      `__tests__/routes/lifecycle.routes.test.ts`)
- [x] Document the API and recovery semantics.
      ([API reference](../docs/reference/api.md),
      [project lifecycle guide](../docs/user-guide/project-lifecycle.md),
      [data model](../docs/reference/data-model.md))

## Checkpoint 11

Phase 11 is complete only when a project fixture can be checkpointed, mutated,
diffed, and restored; the restored graph root hash must equal the checkpoint
hash, and the backend build plus the focused lifecycle suite must pass.

- [x] A fixture project is checkpointed, mutated, diffed, and restored.
- [x] The restored graph root hash equals the checkpoint hash.
- [x] The manifest is deterministic across repeated builds.
- [x] A dependency outside the project fails the manifest build.
- [x] Restore requires a matching `confirmContentHash` and re-verifies every
      stored artifact hash before writing.
- [x] Membership and sharing are excluded from manifests, so a restore cannot
      resurrect removed access.
- [x] Backend build and the focused lifecycle suite pass.

Verification record:
[docs/qa/phases-11-13-mde-lifecycle-2026-08-03.md](../docs/qa/phases-11-13-mde-lifecycle-2026-08-03.md)
