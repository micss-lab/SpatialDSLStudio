# Phase 10 Quality and Readiness Review

- Review date: 2026-07-23
- Scope: `plans/phase-10-elevation-and-aerial-placement.md`
- Verdict: **PASS WITH RELEASE CONDITION**
- Release condition: complete the documented Isaac Sim checks on supported RTX
  hardware before describing Phase 10 as externally runtime-validated

## Executive Summary

Phase 10 implements the planned elevation and aerial-placement slice end to end.
The canonical X/Y/base-Z/yaw contract is consistent across persistence, the 3D
editor, constraints, native and Sirius interchange, code-generation context,
OpenUSD output, and the Smart Warehouse example. Legacy X/Y-only data is
normalized to Z=0, and the airborne and landed drone fixtures exercise both
non-zero and zero base elevations.

No additional product feature is required to satisfy the Phase 10 acceptance
criteria. The repository-verifiable gates pass. The only release-blocking item is
external validation in Isaac Sim, which cannot be replaced by another unit test
or by `usdchecker`.

One follow-up hardening task remains recommended before broad production use:

1. add browser-level coverage for the actual React Three Fiber elevation workflow.

Validation of `VerticalPlacement3D` policy definitions at authoring, import, and
API boundaries was completed on 2026-07-23 as QR-10-02.

These are quality investments, not reasons to expand Phase 10 into drone-flight
simulation.

## Readiness Scorecard

| Area | Result | Notes |
| --- | --- | --- |
| Planned functional scope | PASS | Every repository-verifiable plan item is checked. |
| Backward compatibility | PASS | Legacy `{x, y}` poses normalize to `{x, y, z: 0}`. |
| Persistence integrity | PASS | Z is preserved through model/view updates, copies, imports, and exports. |
| Editor behavior | PASS WITH TEST GAP | Grounded/adjustable behavior and elevation controls are implemented; direct browser interaction coverage is absent. |
| Constraint semantics | PASS | Existing plan-view APIs are preserved and explicit 3D AABB APIs are added. |
| Code generation | PASS | Context and generated JSON, Python, Java, and OpenUSD carry the canonical elevation. |
| Smart Warehouse regression fixture | PASS | Drone Alpha is at 4500 mm; Drone Beta is at 0 mm; grounded equipment remains at Z=0. |
| Automated verification | PASS | The post-hardening baseline is 50 frontend suites/348 tests and 32 backend suites/627 tests, plus successful frontend/backend builds, backend lint, Python tests, Java compilation, USD validation, and manifest validation. |
| Isaac Sim runtime verification | PENDING | Five manual checks require supported NVIDIA RTX hardware. |

The automated counts and toolchain are recorded in the
[Phase 10 verification record](phase-10-elevation-and-aerial-placement-2026-07-22.md).

## Findings

### QR-10-01: Complete the Isaac Sim release gate

- Priority: **P0 for external release**
- Type: release validation, not a missing feature
- Status: open

Run the five checks already listed in the Phase 10 plan:

- open the composed stage without missing-reference, unit, or up-axis warnings;
- compare grounded equipment with the previous floor layout;
- confirm drone base elevations of 4.5 m and 0 m;
- press Play and confirm the kinematic drone holds altitude; and
- capture two matching browser/Isaac Sim views and record runtime versions.

Automated USD composition and schema checks reduce risk, but they do not prove
Isaac Sim render, physics, or Play-mode behavior on the target runtime.

### QR-10-02: Validate placement-policy definitions

- Priority: **P1 hardening**
- Type: input-integrity improvement
- Status: **completed 2026-07-23**

One policy contract now applies to metaclass notation, viewpoint and
representation notation (including containers, layers, and conditional styles),
JSON/project imports, and legacy instance appearance payloads. It:

- accept only `grounded` or `adjustable` modes;
- require every supplied numeric field to be finite;
- require `stepMm > 0`;
- require `minBaseZMm <= maxBaseZMm`; and
- require `defaultBaseZMm` to be within supplied bounds.

The DSL Designer displays the same constraints inline and prevents invalid
saves. Frontend imports fail with the exact policy path, and backend persistence
returns a clear 400 response. The validator intentionally does **not** turn
policy bounds into a global restriction on instance Z: model-only imports and
negative elevations outside an active representation remain valid.

Regression coverage includes policy primitives, metamodel and viewpoint service
boundaries, JSON import, legacy appearance middleware, and representation-editor
save behavior. The complete post-change suites pass: 348 frontend tests and 627
backend tests.

### QR-10-03: Add browser-level 3D interaction coverage

- Priority: **P1 hardening**
- Type: regression-test improvement
- Status: recommended

The current service and unit tests cover coordinate conversion, persistence,
policy resolution, spatial helpers, fixtures, and generation. No test directly
drives `Diagram3DEditor`, `TransformControls`, the base-elevation field, or the
Snap-to-ground action, and the frontend has no Playwright/Cypress configuration.

Add a small browser suite covering:

- adjustable creation uses `defaultBaseZMm`;
- grounded creation uses Z=0 and disables elevation editing;
- vertical drag changes only domain Z and disables orbit controls while active;
- X/Y drag preserves Z;
- step snapping and min/max feedback behave as configured;
- Snap to ground writes exactly zero; and
- save/reload preserves X/Y/Z/yaw exactly.

This suite should run with WebGL enabled so it exercises the real Three.js axis
mapping rather than only mocked service calls.

### QR-10-04: Add spatial reference-frame metadata next

- Priority: **P2 / next spatial capability**
- Type: additional feature
- Status: already tracked in P5

The current contract intentionally assumes millimetres, one project datum,
right-handed Z-up axes, and a 1:1 domain-to-editor scale. That is sufficient for
the sample and Phase 10. Imported floor plans, site coordinates, scaled drawings,
or mixed engineering sources will need explicit units, scale, origin/datum, and
axis-direction metadata at model/view level.

Build this before adding geospatial import or claiming general real-world layout
alignment. It is a more valuable next step than broadening the pose to six
degrees of freedom.

### QR-10-05: Add yaw-aware bounds only when precision requires it

- Priority: **P2 conditional**
- Type: additional feature
- Status: deferred by design

`bounds3DOf`, `overlaps3D`, and `clearance3D` use axis-aligned boxes and ignore
yaw, as documented. This is conservative and adequate for the current warehouse
rules. Add oriented bounding boxes or geometry-aware collision queries when
rotated-rack clearance or safety certification needs materially tighter results.

### QR-10-06: Keep aerial runtime behavior in a separate phase

- Priority: **P3 / product-dependent**
- Type: major additional feature set
- Status: intentionally out of scope

Pitch/roll, six-degree-of-freedom pose, rotor or aerodynamic physics, sensors,
battery behavior, aerial OPC UA state, 3D planning, and autonomous flight are not
needed for elevation placement. They require a distinct aerial state and runtime
contract and should be built only if the product goal moves from static/kinematic
layout validation to drone-operation simulation.

Parent-local elevation, multiple datums, terrain-relative altitude, and a
production drone asset should likewise be separate, requirement-driven work.

## Recommended Decision

- Internal merge/demo: **ready**.
- Phase 10 repository acceptance: **ready**.
- External claim of Isaac Sim validation: **not yet**; complete QR-10-01.
- Immediate engineering follow-up: implement QR-10-03; QR-10-02 is complete.
- Next spatial feature: QR-10-04.
- Do not add full aerial dynamics, a second altitude source, or a database column
  migration as part of Phase 10.
