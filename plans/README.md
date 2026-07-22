# Phase Plans

Per-phase plans derived from the master [ROADMAP.md](../ROADMAP.md). Each phase is
a shippable slice (roughly one PR or a small set). Use this page as the status
dashboard; open a phase file for its scope, tasks, and verification.

Sources of truth for detailed checkboxes:
- Modeling workbench: [sirius-desktop-parity-roadmap.md](../sirius-desktop-parity-roadmap.md)
- Spatial simulation: [smart-warehouse-codegen-future-work.md](../smart-warehouse-codegen-future-work.md)

## Status

Legend: `[ ]` not started, `[~]` in progress, `[x]` implementation and
repository-verifiable checks done. Vendor-runtime release gates remain listed
inside the phase plans until run on the required software/hardware.

### Workbench track

| Phase | Plan | Status |
| --- | --- | --- |
| 1 | [Tree representations and richer tables](phase-01-tree-and-table.md) | [x] |
| 2 | [Tool execution and operation language](phase-02-tool-execution.md) | [x] |
| 3 | [Container mappings](phase-03-container-mappings.md) | [x] |
| 4 | [Validation and property panels](phase-04-validation-and-properties.md) | [x] |
| 5 | [.odesign advanced features](phase-05-odesign-advanced.md) | [x] |
| 6 | [Full Sirius project bundle export](phase-06-sirius-project-bundle.md) | [x] |

### Spatial track (can run in parallel)

| Phase | Plan | Status |
| --- | --- | --- |
| 7 | [Production AMR asset and Isaac Sim QA](phase-07-production-asset-qa.md) | [x] |
| 8 | [PhysX physics and layered USD](phase-08-physx-and-layered-usd.md) | [x] |
| 9 | [Visual Components MAS wiring](phase-09-visual-components-mas.md) | [x] |

## How to use

1. Pick the next phase per the sequencing in `ROADMAP.md`.
2. Work the phase's task checklist; keep its Status header current.
3. When a phase ships, set it to `[x]` here and tick the matching items in the
   detailed tracker.
4. Keep each phase to one focused branch/PR where possible.
