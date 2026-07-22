# F1TENTH AMR QA record

- Asset version: `1.0.0-spatialdsl`
- Source revision: `ccf6b3ee65a3df82160b217a4cd1b523b2f7c351`
- Target runtime: NVIDIA Isaac Sim 4.5 / 5.x
- QA date: 2026-07-21

## Automated checks (recorded July 21, 2026)

| Check | Result |
| --- | --- |
| `usdchecker f1tenth_amr.usda` | PASS |
| `usdchecker f1tenth_amr_collision.usda` | PASS |
| `usdchecker f1tenth_amr_articulation.usda` | PASS |
| `usdcat -l f1tenth_amr_articulation.usda` | PASS; visual, material, collision, and articulation dependencies resolve |
| asset-manifest validator | PASS; 13 files resolved, 0 warnings, 0 errors |
| normalization contract | PASS; default prim, metres, Z-up, +X-forward, ground contact at Z=0 |

The complete matrix, environment, and checksums are in
[`docs/qa/roadmap-phases-06-09-2026-07-21.md`](../../../docs/qa/roadmap-phases-06-09-2026-07-21.md).

## Manual Isaac Sim render/play check

Open `f1tenth_amr_collision.usda`, frame `/F1TenthAMR`, and check:

- red/black/aluminium materials render without missing-texture warnings;
- the robot measures approximately 0.58 × 0.34 × 0.31 metres;
- wheels touch the Z=0 ground plane and the front camera points toward +X;
- collision guides appear only when physics visualization is enabled;
- Play leaves the static asset stable; a dynamic body is supplied by Phase 8.

Manual GPU QA and screenshots require an Isaac Sim host and are intentionally
reported separately from the reproducible repository checks. Do not interpret
the absence of an Isaac runtime in CI as a successful manual render.
