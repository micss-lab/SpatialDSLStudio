# Phase 13: Reproducible Headless MDE Pipelines

- Track: MDE lifecycle
- Status: Completed August 3, 2026
- Depends on: Phase 11 provenance; Phase 12 migration safety
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (MDE lifecycle track, item 13)
- Reference: [docs/user-guide/project-lifecycle.md](../docs/user-guide/project-lifecycle.md)

## Goal

Run model validation, transformations, tests, and code generation on the server
with retained results, deterministic hashes, and CI-friendly failure semantics.

## Scope

- Persist every pipeline definition and run result.
- Capture the exact source project checkpoint before execution.
- Execute ordered validation, transformation, model-test, and generator steps.
- Stop on failure and retain completed step evidence.
- Produce a deterministic result hash and expose project-scoped REST endpoints.
- Add a CLI that exits non-zero when a run fails.

## Implementation

- [x] Add pipeline-run persistence and shared contracts.
      (`PipelineRun`, `HeadlessPipelineDefinition`/`Run` shared types)
- [x] Implement backend validation, transformation, test, and generation steps.
      (`services/pipeline/{model-validation,transformation,test-execution,code-generation}.engine.ts`)
- [x] Add create/list/get endpoints and a CI-oriented CLI.
      (`routes/pipeline.routes.ts`, `scripts/run-pipeline.ts`, `npm run pipeline`)
- [x] Add deterministic manifests and source checkpoint provenance.
      (hash over source checkpoint hash, normalized definition, and step results)
- [x] Add regression tests and operational documentation.
      (`__tests__/services/headless-pipeline.service.test.ts`,
      `__tests__/services/pipeline-engines.test.ts`,
      `__tests__/routes/pipeline.routes.test.ts`,
      `__tests__/scripts/run-pipeline.test.ts`,
      [project lifecycle guide](../docs/user-guide/project-lifecycle.md),
      [API reference](../docs/reference/api.md))

## Checkpoint 13

Phase 13 is complete only when the same project checkpoint and definition
produce the same successful result hash, a failing validation returns a failed
run and non-zero CLI exit, and all Phase 11-13 focused suites plus full builds
pass.

- [x] The same checkpoint and definition reproduce the same result hash.
- [x] A failing validation returns a `FAILED` run that retains the failing
      step's issues and skips the remaining steps.
- [x] The CLI sets a non-zero exit code when the run does not succeed.
- [x] Every run records the source checkpoint it executed against.
- [x] All Phase 11-13 focused suites pass.
- [x] Backend and frontend builds pass.

Verification record:
[docs/qa/phases-11-13-mde-lifecycle-2026-08-03.md](../docs/qa/phases-11-13-mde-lifecycle-2026-08-03.md)
