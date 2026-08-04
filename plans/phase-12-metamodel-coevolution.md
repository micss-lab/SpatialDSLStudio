# Phase 12: Metamodel Evolution and Co-evolution

- Track: MDE lifecycle
- Status: Completed August 3, 2026
- Depends on: Phase 11 checkpoints
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (MDE lifecycle track, item 12)
- Reference: [docs/user-guide/project-lifecycle.md](../docs/user-guide/project-lifecycle.md)

## Goal

Turn metamodel edits into explicit language-evolution operations. Designers can
preview structural changes and affected artifacts before applying a migration.

## Scope

- Compare metamodel structures by stable class/feature IDs.
- Classify breaking and non-breaking changes.
- Report impacted models, viewpoints, transformations, generators, and tests.
- Support explicit attribute rename/removal and class-removal migration rules.
- Apply metamodel and model changes transactionally after creating a Phase 11
  recovery checkpoint.
- Reject stale previews with an expected-source hash.

## Implementation

- [x] Add evolution preview contracts and endpoint.
      (`MetamodelEvolutionReport` and related shared types,
      `POST /:id/evolution/preview`)
- [x] Add deterministic change and impact analysis.
      (`services/lifecycle/metamodel-evolution.service.ts`, matched by stable
      class/feature IDs)
- [x] Add migration-rule validation and transactional apply.
      (`rename-attribute`, `remove-attribute`, `remove-class`; single
      transaction with an in-transaction source re-check)
- [x] Persist migration evidence and recovery checkpoint linkage.
      (`MetamodelMigration.sourceCheckpointId`, restricted delete)
- [x] Add regression tests and user/API documentation.
      (`__tests__/services/metamodel-evolution.service.test.ts`,
      `__tests__/routes/metamodel-evolution.routes.test.ts`,
      [API reference](../docs/reference/api.md),
      [project lifecycle guide](../docs/user-guide/project-lifecycle.md))

## Checkpoint 12

Phase 12 is complete only when a fixture rename migrates instance values, an
unsafe deletion is blocked without an explicit rule, stale source hashes are
rejected, and the Phase 11 checkpoint remains restorable after migration.

- [x] A fixture attribute rename migrates instance values.
- [x] An unsafe class or attribute deletion is blocked without an explicit rule.
- [x] A stale `expectedSourceHash` is rejected with a conflict.
- [x] Apply creates a recovery checkpoint before mutating and records its ID; a
      stale hash is rejected *before* any checkpoint is created.
- [x] The Phase 11 checkpoint remains restorable after a migration. Verified by
      composition rather than one end-to-end test: migration links
      `sourceCheckpointId` with a restricted delete, checkpoints are immutable
      and untouched by apply, and restore is covered in the Phase 11 suite.
- [x] Impacted models, viewpoints, transformations, generators, and tests are
      reported before apply.

Verification record:
[docs/qa/phases-11-13-mde-lifecycle-2026-08-03.md](../docs/qa/phases-11-13-mde-lifecycle-2026-08-03.md)
