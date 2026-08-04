# Phases 11-13 MDE Lifecycle Verification Record

- Date: 2026-08-03
- Host: macOS 26.5.2, Darwin arm64
- Scope: integrated repository verification for the MDE lifecycle track
  (versioned artifact graph, metamodel evolution, headless pipelines)

## Toolchain

| Tool | Version |
| --- | --- |
| Node.js | 24.14.0 |
| npm | 11.9.0 |
| Prisma CLI | 5.22.0 |

## Automated results

| Area | Result |
| --- | --- |
| Backend Jest suite | PASS: 40 suites, 677 tests |
| Frontend Jest suite | PASS: 50 suites, 348 tests |
| Backend TypeScript build | PASS |
| Frontend production build | PASS: compiled successfully |
| Backend ESLint | PASS: no findings |
| Frontend TypeScript check | PASS |
| Prisma schema validation | PASS |
| Prisma schema formatting | PASS |
| Repository whitespace validation | PASS: `git diff --check` |

The backend suite grew from the Phase 10 baseline of 32 suites/627 tests to 40
suites/677 tests. The added suites are the lifecycle services and middleware
carried over from the in-progress work, plus the route and CLI regressions added
to close the Phase 11 and Phase 13 plan items.

## Phase 11: versioned artifact graph

| Check | Result |
| --- | --- |
| Canonical hashing is stable across key order and normalizes negative zero | PASS |
| Manifest is byte-identical across repeated builds of an unchanged project | PASS |
| Artifacts are emitted in dependency order | PASS |
| A dependency outside the project fails the manifest build | PASS |
| Checkpoints are sequential and immutable | PASS |
| Diff reports added, removed, changed, and unchanged counts | PASS |
| Restore requires a matching `confirmContentHash` | PASS: mismatch returns 400 |
| Restore re-verifies per-artifact and root hashes before writing | PASS: failure returns 409 and writes nothing |
| Restored graph root hash equals the checkpoint hash | PASS |
| Membership and sharing are excluded from manifests | PASS: by construction; the manifest collects artifacts only |
| Capability guards on create and restore | PASS: 403 without `checkpoint.create` / `checkpoint.restore` |

Suites: `services/project-checkpoint.service.test.ts`,
`routes/lifecycle.routes.test.ts`, `middleware/projectScope.test.ts`.

## Phase 12: metamodel evolution

| Check | Result |
| --- | --- |
| Stable-ID rename is classified as a rename, not delete-plus-add | PASS |
| Type and cardinality changes are classified as breaking | PASS |
| Attribute rename migrates instance values | PASS: `speed: 12` becomes `maximumSpeed: 12` |
| Rename without an explicit rule is blocked when instances hold values | PASS |
| Class deletion is blocked unless `deleteInstances` is authorized | PASS |
| Stale `expectedSourceHash` is rejected before any checkpoint is created | PASS: 409, checkpoint service not called |
| Apply creates a recovery checkpoint and records `sourceCheckpointId` | PASS |
| Metamodel and model changes apply in one transaction | PASS: source re-checked inside the transaction |
| Impacts are reported for models, viewpoints, transformations, generators, tests | PASS |
| Evolution endpoints reject an unscoped flat request | PASS: 400 |
| Cross-project metamodel is not addressable | PASS: 404 |

Suites: `services/metamodel-evolution.service.test.ts`,
`routes/metamodel-evolution.routes.test.ts`.

The "Phase 11 checkpoint remains restorable after migration" criterion is
verified by composition rather than a single end-to-end test: the migration row
links `sourceCheckpointId` under a restricted delete, apply never mutates or
removes checkpoints, and restore is covered by the Phase 11 suite.

## Phase 13: headless pipelines

| Check | Result |
| --- | --- |
| Same checkpoint and definition reproduce the same run hash | PASS |
| Source checkpoint is captured before the first step | PASS |
| Run stops at the first failing step | PASS: the later step does not execute |
| Failed run retains the failing step's issues | PASS |
| Model validation engine checks conformance, types, references, spatial data | PASS |
| Generation engine is deterministic and rejects path traversal | PASS |
| Model-test engine honors expected-validity semantics | PASS |
| Transformation engine applies the deterministic literal LHS/RHS subset | PASS |
| A failed run returns HTTP 201 with `status: "FAILED"` | PASS |
| CLI exits 0 on success | PASS |
| CLI exits 1 on a failed run, a rejected request, and missing arguments | PASS |
| Capability guard on execution | PASS: 403 without `pipeline.execute` |

Suites: `services/headless-pipeline.service.test.ts`,
`services/pipeline-engines.test.ts`, `routes/pipeline.routes.test.ts`,
`scripts/run-pipeline.test.ts`.

## Not covered here

These are known limits of this record, not silent failures:

- **Live PostgreSQL migration.** `20260722000000_add_studio_project_scope` and
  `20260723010000_add_mde_lifecycle` are validated as schema and SQL, but no
  Docker daemon was available on this host, so neither was applied to a running
  database. Apply both against a staging database before deployment, and confirm
  the legacy-project backfill lands every pre-existing artifact.
- **Restore against real data volumes.** Restore is exercised against mocked
  Prisma delegates. Transaction duration and lock behavior on a large project
  have not been measured.
- **Lifecycle web UI.** Checkpoints, evolution, and pipelines have a typed
  client service but no React components, so there is no browser-level coverage
  for them. This matches the phase scope; the plans specify REST endpoints,
  shared contracts, and a CLI.
- **Concurrent evolution.** The in-transaction source re-check rejects a
  metamodel that moved during preparation, but simultaneous migrations from two
  sessions were not load-tested.

## External release gates

Unchanged from Phase 10 and unrelated to this track: Eclipse Sirius Desktop,
NVIDIA Isaac Sim, and Visual Components/WarehouseMAS runtime checks still
require the corresponding software and hardware.

## Verdict

**PASS.** Phases 11, 12, and 13 meet their plan checkpoints on every
repository-verifiable criterion. The one deployment prerequisite is applying the
two new migrations to a real PostgreSQL instance, which cannot be done on this
host.
