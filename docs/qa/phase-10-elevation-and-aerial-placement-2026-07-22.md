# Phase 10 Elevation and Aerial Placement Verification Record

- Date: 2026-07-22
- Host: macOS 26.5.2, Darwin arm64
- Scope: integrated repository verification for Phase 10

## Toolchain

| Tool | Version |
| --- | --- |
| Node.js | 24.14.0 |
| npm | 11.9.0 |
| Python | 3.9.6 |
| Apple USD Tools | 0.25.2 |
| Java compiler | 21.0.10 |

## Automated results

| Area | Result |
| --- | --- |
| Frontend Jest suite | PASS: 50 suites, 341 tests |
| Backend Jest suite | PASS: 32 suites, 622 tests |
| Frontend production build | PASS: compiled successfully |
| Backend TypeScript build | PASS |
| Backend ESLint | PASS |
| Canonical pose migration and Z-preserving persistence | PASS |
| Grounded/adjustable representation policy and coordinate mapping | PASS |
| 3D constraints and code-generation context | PASS |
| Smart Warehouse project import with two generator projects | PASS |
| Sirius ZIP presentation-sidecar validation and restoration | PASS |
| Generated JSON parsing | PASS |
| Generated Visual Components Java compilation | PASS with `javac` 21 |
| Generated layered OpenUSD scenes | PASS: all four layers accepted by `usdchecker` |
| Inspection-drone OpenUSD asset | PASS: accepted by `usdchecker` |
| Recursive asset-manifest validation | PASS: 14 files, 0 warnings, 0 errors |
| Asset-manifest Python tests | PASS: 4 tests |
| Warehouse navigation, brain, layout, and runtime-mode tests | PASS: 19 tests |
| Omniverse runtime Python syntax compilation | PASS |
| Repository whitespace validation | PASS: `git diff --check` |

The local USD tools emitted duplicate plugin-registration diagnostics while
checking the standalone drone asset, then returned success with no validation
errors. The generated four-layer scene check also returned success.

## Verified elevation fixtures

- `Inspection Drone Alpha` has base elevation `4500` mm and generates OpenUSD
  translation `(12, 6, 4.5)` metres.
- `Inspection Drone Beta` has base elevation `0` mm and generates OpenUSD
  translation `(18, 6, 0)` metres.
- Every legacy or grounded Smart Warehouse spatial record normalizes to an
  explicit finite Z value without changing its X/Y floor pose.
- The runtime layout keeps both drones out of the ground-obstacle/navigation
  collection and represents them as kinematic placement examples, not flight
  controllers.

## External release gate

The following checks require NVIDIA Isaac Sim on supported RTX hardware and are
not available on this host. They remain deliberately unchecked in the phase
plan and are not recorded as passes:

- open the composed stage and check references, units, and Z-up metadata;
- visually compare all grounded equipment with the previous floor layout;
- confirm the airborne and landed drone base elevations;
- press Play and confirm the kinematic drone holds altitude while ground modes
  continue to work;
- capture matching browser/Isaac Sim views and record the Isaac Sim/OpenUSD
  runtime versions.
