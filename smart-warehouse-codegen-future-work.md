# Smart Warehouse Codegen Future Work

## Purpose

Track the work required to move the Smart Warehouse Visual Components and
Omniverse generators from reviewable examples to production-ready integrations.

This is a roadmap, not a commitment to put platform-specific behavior into the
core code generator. Target-specific behavior should remain in importable
projects unless several targets need the same generic capability.

## Current Baseline

Implemented:

- code generation project import from merged PR #14
- Smart Warehouse Visual Components and Omniverse projects consolidated on
  current-main PR #30
- eight Visual Components outputs, including OPC UA configuration
- OpenUSD scene generation for 30 physical warehouse elements, including landed
  and airborne inspection drones
- model-driven OPC UA port and namespace values
- automated Handlebars rendering, JSON parsing, and XML parsing tests
- a normalized MIT-licensed NVIDIA F1TENTH AMR with provenance, collision, and
  optional articulation layers
- four generated USD layers (layout, assets, physics, and composed simulation)
- kinematic, dynamic rigid-body, and differential-drive bridge modes
- model-driven Visual Components controller/task/product configuration with a
  shared stable OPC UA node contract

The CC0 vehicle remains a composition regression fixture. The generated scene
now contains structural PhysX opinions and a controllable production AMR, while
route/package/event/deterministic-output work remains in the longer simulation
plan below.

## Release Gates

- [x] Merge PR #14.
- [x] Consolidate the PR #16 work onto PR #30 against current `main`.
- [x] Run the normal CI workflow on PR #30.
- [ ] Import and generate all eight files in the deployed application.
- [ ] Load the generated setup script and connectivity XML in Visual Components.
- [ ] Confirm the OPC UA application URI advertised by the real server.
- [ ] Run the generated OpenUSD script in Isaac Sim.
- [x] Confirm referenced assets resolve when the asset-root argument is supplied (automated).
- [x] Confirm missing assets produce visible cube fallbacks rather than an invalid stage (automated).

## Isaac Sim Simulation Status

The current output has a physics scene, collision/mass schemas, and three robot
control modes, but no generated simulation clock, route scheduler, package
lifecycle, contact-event logger, or deterministic output bundle. The external
MAS brain supplies navigation and repeated pickup/dropoff behavior.

Isaac Sim on a supported NVIDIA RTX workstation or cloud instance is the
required runtime for the physical simulation. The next implementation must add:

- sensors and synthetic-data capture
- runtime telemetry and event export

Running the current generator inside Isaac Sim is necessary for this target but
is not sufficient by itself; the physics and behavior layers above remain
future work.

## Physics And Runtime Codegen Plan

### Architectural Decision

Maintain two importable code generation projects with one versioned simulation
contract:

1. Extend `smart-warehouse-omniverse-project.json` as the Isaac Sim target.
2. Add `smart-warehouse-ovphysx-project.json` as the headless CPU PhysX target.

Both projects must generate the same runtime-neutral scene, configuration,
behavior, event, and output contracts. Only the runtime launcher and physics
adapter should differ. Do not maintain separate Isaac Sim and `ovphysx` package
state machines or event schemas.

The current codegen project format already supports multiple templates and
`java`, `python`, `json`, `xml`, and `plaintext` content types. It does not
support project inheritance, shared templates, or project-level binary assets.

### Generated Bundle Contract

Each target should generate a self-contained bundle with these logical files:

```text
build_warehouse_simulation.py   # Authors layout and physics USD layers
warehouse_behavior.py           # Runtime-neutral jobs and state machines
simulation_config.json          # Fixed step, seed, gravity, routes, and jobs
event_logger.py                 # Shared event and state-output contract
run_isaac_sim.py                # Isaac Sim project only
run_ovphysx.py                  # ovphysx project only
```

Running the build script should create:

```text
warehouse_layout.usda           # Geometry, transforms, and asset references
warehouse_physics.usda          # Scene, colliders, bodies, mass, and joints
warehouse_simulation.usda       # Root layer composing layout and physics
```

Running either simulation launcher should create:

```text
events.jsonl                    # Ordered domain and contact events
states.csv                      # Timestamped robot and package state
summary.json                    # Outcome, counts, timing, and error details
```

### Phase 0: Model And Codegen Prerequisites

The current Smart Warehouse metamodel has no explicit package, route, delivery
job, waypoint, or simulation configuration classes. Add the minimum concepts
before generating behavior:

- [ ] Add `SimulationConfiguration` with fixed time step, duration, random seed,
  gravity, log interval, and runtime-neutral solver settings.
- [ ] Add `Package` with dimensions, mass, initial location, and initial state;
  keep mutable lifecycle state in the simulation runtime and outputs.
- [ ] Add `Waypoint` and `Route` with deterministic ordering and tolerances.
- [ ] Add `DeliveryJob` with package, pickup, destination, priority, and optional
  assigned robot references.
- [ ] Add physics attributes or a reusable physics profile for collider type,
  mass, friction, restitution, and static/kinematic/dynamic body mode.
- [ ] Add differential-drive parameters for wheel radius, wheel separation,
  maximum linear speed, and maximum angular speed.
- [ ] Add backward-compatible defaults and migrate the existing Smart Warehouse
  fixture without changing its current layout.
- [ ] Enrich the codegen context with resolved reference targets, stable names,
  and ordered relationship data instead of exposing only raw element IDs.
- [ ] Add native `json` and plain-text template content types, or document the
  temporary Python-only configuration format.

Phase 0 is complete when existing projects still import, the enriched fixture
contains one deterministic delivery scenario, and templates can address every
package, route, waypoint, job, robot, and station without hard-coded IDs.

### Phase 1: Generate `UsdPhysics.Scene`

- [ ] Import `UsdPhysics` in the generated build script.
- [ ] Define exactly one physics scene under `/World/PhysicsScene`.
- [ ] Generate gravity direction and magnitude from `SimulationConfiguration`.
- [ ] Set `metersPerUnit`, `upAxis`, `timeCodesPerSecond`, and fixed-step metadata
  consistently across the composed layers.
- [ ] Keep the layout layer physics-free and author simulation APIs in the
  physics layer.
- [ ] Validate the composed root stage with `usdchecker`.

Acceptance: both runtime projects generate the same physics-scene path and
stage metadata, and the root stage opens without validation errors.

### Phase 2: Generate Collision Shapes

- [ ] Generate a static floor collider; keep pathway areas non-colliding by
  default unless the model explicitly marks them as physical surfaces.
- [ ] Generate static or kinematic conveyor colliders according to configuration.
- [ ] Generate simple proxy colliders for robots and packages independently of
  their render meshes.
- [ ] Generate colliders for charging stations and output locations when they
  participate in contact or occupancy checks.
- [ ] Use primitive or reviewed convex colliders for moving bodies; do not use
  detailed dynamic triangle meshes by default.
- [ ] Generate collision groups and masks for environment, robots, packages,
  sensors, and carried packages.
- [ ] Add diagnostics for invalid dimensions, unsupported collider types, and
  initial interpenetration.

Acceptance: a package dropped above the floor settles on it, robots cannot pass
through static warehouse equipment, and collision filtering is deterministic.

### Phase 3: Generate Rigid Bodies And Mass Properties

- [ ] Apply rigid-body APIs only to dynamic or kinematic objects.
- [ ] Generate mass, center of mass, inertia, damping, friction, and restitution
  from modeled values with documented defaults.
- [ ] Treat the floor and fixed equipment as static collision geometry; do not
  turn route or pathway markings into rigid bodies by default.
- [ ] Treat packages as dynamic bodies except while explicitly attached to a
  robot or conveyor transport mechanism.
- [ ] Add generated assertions for positive mass, valid inertia, and finite
  dimensions.
- [ ] Add a gravity-and-contact regression test for every dynamic class.

Acceptance: dynamic packages and robot bodies respond to gravity and contact,
while fixed warehouse geometry remains stationary.

### Phase 4: Generate Robot Articulation And Differential Drive

- [ ] Use a generated two-wheel test robot as the first physical reference so
  the implementation is not blocked by the current non-articulated CC0 vehicle.
- [ ] Generate a chassis, left and right wheels, revolute joints, articulation
  root, wheel limits, damping, and drive parameters.
- [ ] Define a runtime-neutral controller interface for linear and angular
  velocity commands.
- [ ] Generate an Isaac Sim differential-drive adapter.
- [ ] Generate an `ovphysx` articulation or joint-drive adapter with the same
  command and state interface.
- [ ] Add asset-manifest joint-name mappings before substituting a production AMR
  asset for the generated test robot.
- [ ] Add straight-line, in-place rotation, stop, and emergency-stop tests.

Acceptance: one generated robot follows commanded linear and angular velocities
within defined pose tolerances in both runtimes.

### Phase 5: Generate Route And Package Controllers

- [ ] Generate a deterministic route graph from modeled waypoints and routes.
- [ ] Validate that pickup, destination, charging, and robot start locations are
  reachable before simulation starts.
- [ ] Generate a delivery-job state machine with `Pending`, `Assigned`,
  `NavigatingToPickup`, `Carrying`, `Delivered`, and `Failed` states.
- [ ] Generate deterministic job assignment using priority and stable element
  identifiers as tie breakers.
- [ ] Generate waypoint following, arrival tolerance, timeout, retry, and blocked
  route behavior.
- [ ] Generate package pickup and release using an explicit attachment or joint
  policy rather than teleporting packages without an event.
- [ ] Keep route and package logic runtime-neutral; isolate only pose, drive,
  contact, and attachment operations in runtime adapters.

Acceptance: two robots complete a generated delivery job without sharing a
package, violating the state machine, or selecting routes nondeterministically.

### Phase 6: Generate Contact And Event Collection

- [ ] Define a versioned event envelope containing schema version, sequence,
  simulation step, simulation time, event type, entity IDs, and payload.
- [ ] Generate events for simulation start/stop, assignment, route progress,
  pickup, release, delivery, charging, collision, timeout, and failure.
- [ ] Generate Isaac Sim contact/event collection behind the runtime adapter.
- [ ] Generate `ovphysx` contact report or contact binding collection behind the
  same adapter contract.
- [ ] Separate high-frequency state samples from lower-volume domain events.
- [ ] Add configurable contact thresholds and event de-duplication.

Acceptance: both runtimes produce schema-valid event streams with the same
domain-event ordering for the reference scenario, allowing documented numeric
differences in contact values.

### Phase 7: Generate Deterministic Stepping And Outputs

- [ ] Use a fixed time step and explicit step count; never use wall-clock time as
  simulation truth.
- [ ] Seed every randomized decision from `SimulationConfiguration`.
- [ ] Use synchronous stepping in test and batch modes.
- [ ] Generate ordered JSON Lines events, CSV state samples, and a JSON summary.
- [ ] Flush partial outputs and record a structured failure when simulation stops
  unexpectedly.
- [ ] Record generator version, model ID, model checksum, runtime, runtime version,
  fixed time step, and random seed in every run manifest.
- [ ] Add same-runtime repeatability tests and cross-runtime semantic parity tests.

Acceptance: repeated runs with the same model, runtime, version, and seed produce
the same domain-event trace and summary. Cross-runtime tests compare outcomes and
toleranced poses rather than requiring bit-identical floating-point state.

### Phase 8: Add The `ovphysx` Codegen Project

Create:

```text
examples/codegen-projects/smart-warehouse-ovphysx-project.json
```

Its generated bundle should include:

- [ ] The common USD build, behavior, configuration, and logging outputs.
- [ ] `run_ovphysx.py` configured explicitly for CPU simulation.
- [ ] A pinned and centrally documented tested `ovphysx` version.
- [ ] `requirements.txt` and a CPU-only Ubuntu `Dockerfile` after plain-text
  template types are supported.
- [ ] A CLI accepting input scene, output directory, duration, fixed time step,
  seed, and log level without changing the generated source.
- [ ] Startup validation for schema support, missing assets, invalid physics
  configuration, and unavailable runtime libraries.
- [ ] Graceful handling of the expected no-GPU warning in CPU mode.
- [ ] An optional service wrapper only after the deterministic CLI runner is
  stable; keep physics execution independent of HTTP or queue infrastructure.

Because `ovphysx` is pre-1.0, isolate all calls in one adapter, pin the tested
version, and do not expose its API directly to generated behavior code.

Acceptance: an Ubuntu CI job or container with no NVIDIA device loads the
generated root USD, runs at least 600 CPU steps, verifies floor contact and robot
movement, and writes schema-valid events, states, and summary files.

### Shared-Template And Drift Control

The two importable projects must remain self-contained, but common generated
files must not drift:

- [ ] Keep one canonical simulation-contract version and event schema.
- [ ] Render both projects against the same Smart Warehouse fixture.
- [ ] Assert that common configuration and behavior outputs are semantically
  identical.
- [ ] Add a shared-template/include capability only when a third runtime or
  meaningful duplication makes the core change worthwhile.
- [ ] Keep runtime-specific imports out of common behavior and logging modules.

### Verification Matrix

| Gate | Template tests | Ubuntu CPU `ovphysx` | Isaac Sim RTX |
| --- | --- | --- | --- |
| Project import and deterministic render | Required | N/A | N/A |
| USD syntax and composition | Required | Required | Required |
| Physics scene, collision, mass | Structural | Runtime | Runtime |
| Differential drive | Generated-code checks | Runtime | Runtime |
| Delivery state machine | Unit tests | Runtime | Runtime |
| Contacts and events | Schema tests | Runtime | Runtime |
| Deterministic repeated run | Fixture hash | Required | Required |
| RTX sensors and rendered QA | N/A | N/A | Required |

### Suggested Implementation PRs

1. Smart Warehouse simulation metamodel, fixture migration, and resolved codegen
   references.
2. Codegen content types plus the versioned simulation and event schemas.
3. Isaac Sim USD scene, collision, rigid-body, and mass generation.
4. Initial `ovphysx` CPU project and Ubuntu 600-step physics smoke test.
5. Generated differential-drive articulation and runtime adapters.
6. Route graph, delivery jobs, package lifecycle, and attachment policy.
7. Contact collection, deterministic stepping, event logs, state samples, and
   summaries.
8. Cross-runtime parity suite, production AMR substitution, and Isaac Sim QA.

## Real USD Asset Support

### Implemented Production AMR

The normalized AMR package is under:

```text
examples/omniverse-assets/nvidia-f1tenth-amr/
```

The manifest maps `MobileRobot` to:

```text
nvidia-f1tenth-amr/f1tenth_amr_collision.usda
```

The package is a lightweight USDA re-authoring of NVIDIA's MIT-licensed
F1TENTH sample at revision
`ccf6b3ee65a3df82160b217a4cd1b523b2f7c351`. It records metre/Z-up/+X-forward
normalization, provenance, materials, collision proxies, and an optional
differential-drive articulation root. The legacy Python builder still uses a
cube when any mapped asset is unavailable.

### Production Asset Onboarding

Every production asset should pass this sequence:

1. Record source, author, license, version, and redistribution terms.
2. Reject assets that cannot legally be redistributed with the repository.
3. Ensure the root layer has a valid `defaultPrim`.
4. Normalize or explicitly record `metersPerUnit` and `upAxis`.
5. Preserve all referenced layers, textures, and materials with relative paths.
6. Add class mapping, orientation, scale, and vertical offset metadata.
7. Validate the root asset with `usdchecker` and `usdcat -l`.
8. Inspect it in Isaac Sim with materials enabled.
9. Add collision and physics schemas in a separate simulation layer.
10. Add a regression test for missing and resolved asset paths.

### Asset Manifest

The versioned manifest now records portable paths, provenance, orientation,
body mode, mass, wheel geometry, and joint mappings:

```json
{
  "MobileRobot": {
    "asset": "nvidia-f1tenth-amr/f1tenth_amr_collision.usda",
    "articulationAsset": "nvidia-f1tenth-amr/f1tenth_amr_articulation.usda",
    "uniformScale": 1.0,
    "rotateXDeg": 0,
    "zOffsetM": 0.0
  }
}
```

The manifest supports project defaults plus per-element overrides. Both browser
validation and the filesystem validator reject absolute/traversal paths; the
latter recursively verifies local USDA dependencies.

## Prioritized Backlog

### P0: Release Completion

- [ ] Complete the release gates above.
- [ ] Record tested Visual Components and Isaac Sim versions.
- [ ] Add a QA report with screenshots and generated-file checksums.

### P1: Asset Pipeline Hardening

- [x] Add a versioned asset manifest and schema validation.
- [x] Package referenced assets in a portable repository asset root.
- [x] Add per-class and per-element asset selection.
- [x] Calculate fit scale from modeled dimensions and preserve normalized AMR scale.
- [x] Normalize the production AMR into the Z-up generated stage.
- [ ] Add missing-asset diagnostics to the generated script and UI.
- [ ] Decide whether production assets live in Git LFS, object storage, or Nucleus.

### P2: Physics And Runtime Codegen

- [ ] Complete the model and codegen prerequisites in Phase 0.
- [x] Generate the layered scene, collision, rigid-body, and mass contract.
- [x] Generate the differential-drive articulation and shared controller API.
- [ ] Generate route, package, contact, event, and deterministic output logic.
- [ ] Add the CPU-only `ovphysx` codegen project and Ubuntu runtime test.
- [ ] Validate the same simulation contract in Isaac Sim on RTX.

### P3: Visual Components Hardening

- [x] Make OPC UA application URI a model attribute or generation parameter.
- [ ] Detect supported Visual Components installation and library paths.
- [ ] Verify Python API compatibility for each supported Visual Components version.
- [ ] Test generated OPC UA node IDs against the live WarehouseMAS server.
- [x] Replace `java` language tags on JSON/XML templates with native content types.

### P4: Core Codegen Improvements

- [x] Add native `json`, `xml`, and plain-text template content types.
- [x] Make generated ordering deterministic without changing semantic model order.
- [ ] Add project-level static assets or binary attachment support.
- [ ] Add end-to-end import, generate, and ZIP-download coverage.

### P5: Spatial Semantics

- [x] Implement the Phase 10
  [elevation and aerial placement plan](plans/phase-10-elevation-and-aerial-placement.md).
- [x] Define an explicit transform between domain, Three.js, and OpenUSD coordinates.
- [ ] Store scale, origin, axis direction, and units as model/view metadata.
- [x] Expose canonical spatial presentation fields to JS and OCL constraints.
- [x] Add plan-view-compatible and explicit 3D bounds, overlap, and clearance helpers.
- [x] Synchronize aligned 2D/3D X/Y edits while preserving Z and deliberately
  distinct legacy schematic layouts; keep elevation independent from 2D.

The current Smart Warehouse fixture retains deliberately distinct schematic 2D
and physical coordinates where they already differ. New aligned spatial
placements use millimetres in canonical presentation; a future datum/scale
metadata phase should make non-1:1 projections explicit.

### Optional: Portable Analytical Simulation

After the Isaac Sim path works, a SimPy-based discrete-event model could provide
fast scheduling experiments, deterministic event logs, and throughput metrics.
This is a nice-to-have analytical backend, not a replacement for Isaac Sim and
not a release gate for physical simulation.

## Asset Delivery Sequence

1. Asset manifest and generated-script parameterization.
2. Asset packaging and missing-asset diagnostics.
3. One production-grade AMR asset with joint mapping, collision, and Isaac Sim QA.
4. Static assets for conveyors, stations, and output locations.
5. Instanceable references and asset-level regression coverage.

## Simulation Definition Of Done

The generated simulation path is complete when:

- one Smart Warehouse model generates self-contained Isaac Sim and `ovphysx`
  bundles implementing the same versioned simulation contract
- the generated USD includes a physics scene, reviewed colliders, body modes,
  mass properties, and a controllable differential-drive robot
- a generated package completes a modeled route and delivery job
- both runtimes emit schema-valid events, states, and summaries
- repeated runs are deterministic under the documented comparison rules
- an Ubuntu CPU environment completes the `ovphysx` reference scenario without
  an NVIDIA device
- Isaac Sim completes the reference scenario on a supported RTX host

## Asset Definition Of Done

The asset-based Omniverse path is production-ready when:

- every generated physical class resolves to an approved asset or documented fallback
- the generated stage opens without missing references or validation errors
- units, orientation, dimensions, and placement match the source model
- repeated assets use references or instances rather than copied geometry
- licensing and provenance are recorded for every distributed asset
- CI validates templates and USD layers
- Visual Components and Isaac Sim QA results are attached to the release
