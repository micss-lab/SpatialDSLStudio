# Phase 10: Elevation and Aerial Placement

- Track: Spatial
- Status: Implementation and automated QA completed July 22, 2026; manual Isaac Sim release gate pending
- Verification: [Phase 10 QA record](../docs/qa/phase-10-elevation-and-aerial-placement-2026-07-22.md)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (spatial track, item 10)
- Tracker: [smart-warehouse-codegen-future-work.md](../smart-warehouse-codegen-future-work.md) (P5)
- Depends on: project-scoped sample import for the final example packaging; the
  coordinate and persistence work can start independently

## Goal

Extend SpatialDSL Studio from ground-plane placement to a backward-compatible
4-DOF spatial pose: X, Y, base elevation Z, and yaw around Z. A DSL Designer can
declare whether a representation keeps a class grounded or lets a Modeler adjust
its elevation. The Smart Warehouse sample must then place an inspection drone
above the floor and generate the same pose correctly in OpenUSD/Isaac Sim.

## Recommendation

Extend the existing Smart Warehouse project instead of adding a second drone-only
project. A mixed warehouse is the stronger regression fixture: it proves that old
grounded equipment remains unchanged while elevated and landed instances of the
same aerial class work through the editor, persistence, validation, import/export,
and Omniverse generators.

The first release should support placement, visualization, code generation, and
kinematic simulation of aerial items. It should not claim full drone simulation.
Pitch, roll, flight dynamics, 3D route planning, rotor physics, and an aerial OPC
UA controller belong in a later phase.

## Why This Is Needed

The current implementation is effectively 2.5D:

- `position3D` stores only `x` and `y`.
- Three.js maps domain X/Y onto its ground plane and hard-codes its vertical
  coordinate to zero.
- 3D dragging intersects a ground plane, so it can only change X/Y.
- The code-generation context exposes X, Y, and RZ, but no Z.
- Omniverse templates synthesize USD Z from half the object's height, assuming
  every object's base is on the floor.
- The layout loader and Isaac Sim bridge discard elevation.
- Spatial overlap helpers use only a plan-view AABB.

Adding only a Z input to the inspector would therefore be incomplete. It would be
easy for later 2D edits to erase Z, for the browser and generated USD to disagree,
or for gravity to drop a generated drone to the floor.

## Coordinate and Pose Contract

Use one right-handed, Z-up domain coordinate system. Domain positions and sizes
remain millimetres; generated USD stages remain metres with `metersPerUnit = 1`.

| Concept | SpatialDSL domain | Three.js editor | OpenUSD/Isaac Sim |
| --- | --- | --- | --- |
| Position | `{ x, y, z }` mm | `[x, z, -y]` scene units | `[x/1000, y/1000, z/1000]` m |
| Vertical meaning | `z` is base elevation above the project datum | Group origin is at the asset base | Referenced prim origin is placed at base elevation |
| Orientation | `rotationZ` is yaw in degrees | rotation about Three.js Y | `xformOp:rotateZ` |
| Stored extents | `widthMm`=X, `heightMm`=Y, `depthMm`=Z | `[widthMm, depthMm, heightMm]` along Three.js X/Y/Z | `[widthMm, heightMm, depthMm]` along USD X/Y/Z |

The base-elevation decision is important. Missing Z becomes zero without changing
existing scenes, base-normalized GLB/USD assets remain easy to place, and a fitted
box uses the unambiguous center formula `z + verticalExtent / 2`.

The existing dimension names are awkward, but renaming persisted fields while
adding elevation would make the migration unnecessarily risky. This phase should
centralize the mapping as X=`widthMm`, Y=`heightMm`, Z=`depthMm`, fix the current
fallback-geometry/inspector inconsistencies, and retain compatibility aliases
`Length`, `Width`, and `Height` for templates. A future schema migration may replace
them with explicit `xMm`, `yMm`, and `zMm` extents.

## Data Contract

The normalized in-memory and newly exported contract should require all three
coordinates:

```ts
interface Position3D {
  x: number;
  y: number;
  z: number; // base elevation in millimetres
}

interface ModelElementPresentation {
  position3D?: Position3D;
  // existing size3D and rotationZ fields remain unchanged
}
```

Import DTOs must still accept legacy `{x, y}` values. A single boundary normalizer
must turn those into `{x, y, z: 0}` before application code uses them. Do not add Z
to non-spatial semantic elements that have no `position3D` at all.

`presentation.position3D` remains the source of truth. Legacy
`style.position3D` is migration input only and must not become a second writable
pose store.

There is no SQL column migration: model and view presentation values are already
stored as JSON. The migration is a JSON-shape normalization plus fixture backfill.

## Representation-Level Placement Policy

Add an optional policy to `ConcreteSyntax3D`:

```ts
interface VerticalPlacement3D {
  mode: 'grounded' | 'adjustable';
  defaultBaseZMm?: number;
  minBaseZMm?: number;
  maxBaseZMm?: number;
  stepMm?: number;
}

interface ConcreteSyntax3D {
  // existing asset, fallback, and size fields
  verticalPlacement?: VerticalPlacement3D;
}
```

Rules:

- Missing policy means `grounded`, preserving current behavior.
- Grounded creation uses Z=0 and the elevation editor is disabled.
- Adjustable creation uses `defaultBaseZMm`, falling back to zero.
- Minimum/maximum values constrain authoring in that representation. The backend
  still accepts any finite Z because model-only imports have no active
  representation and other domains may legitimately use negative elevations.
- Opening a grounded representation must never silently overwrite an existing
  non-zero Z. Show a validation warning and preserve the data.
- `zOffsetM` in the asset manifest remains an asset-pivot correction. It must not
  be used as the instance's modeled elevation.

This is an interaction policy, not a hard-coded `isAerial` domain concept. It can
also support shelf-mounted sensors, overhead cranes, mezzanine equipment, and
other elevated objects.

Role ownership remains as previously agreed:

- A DSL Designer defines the metaclass and its representation placement policy.
- A Modeler creates model/view containers and instances, and edits X/Y/Z/yaw when
  the active representation permits it.
- A Viewer cannot change the pose.
- No new project permission or role is required.

## Scope

In this phase:

- Canonical X/Y/Z/yaw persistence and migration.
- Grounded versus adjustable elevation authoring.
- Numeric Z editing, an axis-constrained vertical handle, ground snapping, and
  clear altitude cues in the 3D editor.
- 3D bounds helpers in addition to the existing plan-view helpers.
- Native JSON and SpatialDSL project-bundle round-trip.
- Code-generation context and all Smart Warehouse Omniverse outputs.
- A static/kinematic inspection-drone sample that remains at altitude when Isaac
  Sim starts playing.

Out of scope:

- Pitch/roll or a general six-degree-of-freedom pose.
- Drone flight controllers, rotor/aerodynamic simulation, IMU/camera sensors, or
  battery discharge behavior.
- 3D path planning, aerial collision avoidance, and changes to the existing
  ground-robot occupancy grid or OPC UA contract.
- Parent-local transforms, multiple project datums, terrain-following altitude,
  or geospatial coordinate reference systems.
- A breaking rename of the legacy `size3D` fields.

## Implementation Plan

### 1. Contract, Normalization, and Persistence

- [x] Add shared `Position3D` and `VerticalPlacement3D` types in
  `shared/types/index.ts`, generated declarations, and frontend model types.
- [x] Add pure shared helpers for finite-number validation, legacy Z=0
  normalization, domain-to-render transforms, and axis extents.
- [x] Normalize model, view, and project imports at their boundaries; make native
  exports always include Z when `position3D` exists.
- [x] Update frontend and backend presentation merge/write-through code so an X/Y
  move spreads/preserves the current Z instead of rebuilding `{x, y}`.
- [x] Ensure a direct 3D move mirrors only X/Y into an aligned 2D position; a Z-only
  edit must never change 2D coordinates.
- [x] Validate that X, Y, Z, extents, and rotation are finite on both model- and
  view-presentation endpoints. Reject `NaN`, infinities, strings, and malformed
  partial objects with a 400 response.
- [x] Backfill repository examples with `z: 0`; rely on lazy normalization rather
  than a database-wide rewrite for existing installations.

Likely touch points include `diagram.service.ts` and
`model-element-crud.service.ts` in both tiers, presentation routes, model/view
migration services, projection mapping, and import/export services.

### 2. 3D Editor and Language Authoring

- [x] Extend the concrete-syntax editor so a DSL Designer can choose grounded or
  adjustable placement and configure default/min/max/step values.
- [x] Resolve the policy through `concreteSyntaxResolver` with grounded defaults.
- [x] Change `Node3D` placement from `[x, 0, -y]` to `[x, z, -y]`; keep generated
  and loaded geometry base-normalized inside the group.
- [x] Keep existing ground-plane drag for X/Y and preserve Z during every drag.
- [x] Add an elevation field labelled `Base elevation Z`, a `Snap to ground`
  action, and a Three.js-Y/domain-Z constrained drag handle. Disable orbit
  controls while the vertical handle is active.
- [x] Apply configured step snapping and min/max feedback without silently
  truncating stored values.
- [x] Show a ground projection/drop line and an elevation label for selected
  elevated elements so altitude is visually legible.
- [x] Include maximum scene elevation in camera framing and clipping calculations.
- [x] Relabel dimensions consistently as `Length X`, `Width Y`, and `Height Z`,
  and correct fallback geometry that currently swaps the X/Y extents.
- [x] Replace the current inaccurate note that 2D and 3D positions are always
  independent with text describing X/Y synchronization and Z independence.

### 3. Constraints and Interoperability

- [x] Preserve existing `boundsOf`, `overlaps`, and `clearance` as plan-view APIs
  so current constraints do not change meaning.
- [x] Add `bounds3DOf`, `overlaps3D`, and `clearance3D`. Use base Z as `minZ` and
  `base Z + depthMm` as `maxZ`; document that rotation is still approximated by
  an axis-aligned box.
- [x] Expose normalized Z and the new helpers to JavaScript/OCL constraint
  contexts.
- [x] Add validation examples for minimum flight altitude, maximum altitude, and
  3D clearance from racks.
- [x] Preserve Z in native JSON import/export and project copies/remaps.
- [x] Add `spatialdsl-presentation.json` to the full Sirius project bundle and
  consume it on re-import. It should carry Z, 3D extents, and yaw keyed by stable
  semantic element identity.
- [x] Keep `.ecore`, `.xmi`, `.odesign`, and `.aird` valid for Sirius Desktop.
  SpatialDSL's supported `.aird` subset carries only 2D GMF layout, so pure Sirius
  export/import without the sidecar must report that 3D presentation will default
  to ground rather than silently claiming a lossless round-trip.

### 4. Code-Generation Contract

- [x] Extend `codegen-context-builder.service.ts` with normalized
  `position3D.z`, `Z`, and `BaseElevationMm`. When X/Y exist but legacy Z is
  absent, expose numeric zero; do not give non-spatial elements a fabricated pose.
- [x] Extend the Handlebars debug output and add a tested helper for
  `(baseZMm + depthMm / 2) / 1000` (template inputs `Z` and compatibility alias
  `Height`). Do not use truthiness to default numeric fields because zero is
  valid.
- [x] Add context tests for legacy Z=0, non-zero Z, negative finite Z, diagram
  overrides, and deterministic generation.
- [x] Keep existing templates that use only X/Y/RZ backward compatible.

### 5. Smart Warehouse Example

- [x] Add an `InspectionDrone` metaclass and a `WarehouseSystem.drones`
  containment reference.
- [x] Give the drone a small semantic set such as `name`, `Status`,
  `BatteryLevel`, and `MaxAltitudeMm`. Current pose remains presentation data;
  do not duplicate it as a semantic `CurrentAltitude` attribute.
- [x] Add adjustable drone concrete syntax with a 3,000 mm default, 0 mm minimum,
  10,000 mm maximum, and a visible 2D notation/3D fallback.
- [x] Add two instances: one airborne inspection drone at 4,500 mm and one landed
  drone at 0 mm. Existing physical elements explicitly receive Z=0.
- [x] Add drones to the full warehouse and resource-tree views.
- [x] Add an `Aerial Inspection` diagram/view containing drones, racks, docks,
  and other useful inspection landmarks. This is easier to understand than
  hiding the drone among every floor-plan element.
- [x] Import the metamodel, model, viewpoints, views, and codegen project into one
  Smart Warehouse project under the project-scoped workflow.
- [x] Verify the Visual Components generator continues to ignore the new class
  safely; aerial control is not part of that target in this phase.

### 6. Omniverse and Isaac Sim Output

- [x] Add `z_mm` to every generated Python element record and Z to every generated
  `warehouse_layout.json` record, including grounded records where it is zero.
- [x] Update the Python builder and layered USDA templates with these formulas:
  - fitted/fallback geometry center Z = `(baseZMm + depthMm / 2) / 1000`,
    plus `zOffsetM` only for a referenced asset that needs pivot correction
  - base-normalized referenced asset Z = `baseZMm / 1000 + zOffsetM`
- [x] Emit `spatialDsl:zMm` or `spatialDsl:baseElevationMm` metadata on generated
  prims for traceability.
- [x] Add a project-authored, redistributable
  `warehouse-kit/inspection_drone.usda`, with `defaultPrim`, metre units, Z-up
  axes, base-at-zero geometry, provenance, and asset-manifest mapping. A primitive
  authored visual asset is preferable to adding an unreviewed network dependency;
  its proxy collider belongs in the generated physics layer.
- [x] Add an `/World/InspectionDrone` group to layout, asset, and physics layers.
  Use a kinematic rigid body for the sample so gravity does not drop it when Play
  starts; keep the collider separate from the render mesh.
- [x] Extend `warehouse_sim/layout.py` to scale Z and return a `drones` group.
- [x] Extend `run_warehouse_sim.py` to instantiate/preserve the modeled drone pose
  in generated-scene and build-from-layout modes.
- [x] Keep drones out of the 2D ground navigation grid and robot control loop.
  A later aerial-runtime phase should define a separate `[x, y, z, yaw]` state and
  3D planner rather than overloading the ground robot contract.
- [x] Include maximum Z in generated camera/light framing while keeping floor
  bounds an X/Y calculation.
- [x] Update the Omniverse user guide with base-elevation, asset-pivot, and
  kinematic-versus-flight semantics.

The generated stages should continue to use OpenUSD's standard transform stack,
metre metadata, and Z-up axis. OpenUSD supports 3D translate and Z-rotation ops,
and Isaac Sim distinguishes visual/static objects from rigid bodies; applying a
kinematic rigid body is therefore an explicit choice to hold a modeled pose, not
an assertion that flight dynamics exist.

## Verification Matrix

| Area | Required automated evidence |
| --- | --- |
| Types and migration | Legacy `{x,y}` normalizes to `{x,y,z:0}`; canonical export includes Z |
| Persistence | X/Y edits preserve non-zero Z; Z edits preserve 2D X/Y; frontend/backend behavior matches |
| API | Non-finite/malformed poses are rejected; valid zero and non-zero Z round-trip |
| Editor | Coordinate helper maps domain `(x,y,z)` to Three `(x,z,-y)`; grounded and adjustable controls behave correctly |
| Dimensions | Browser fallback/custom-model bounds and USD extents use the same X/Y/Z mapping |
| Constraints | Existing 2D helpers retain behavior; new 3D overlap distinguishes stacked objects |
| Codegen context | `Z` and `BaseElevationMm` are numeric and deterministic, including zero |
| Templates | Generated JSON parses; Python compiles; exact drone and grounded translations are asserted |
| USD assets/layers | Manifest validation, recursive dependency checks, `usdchecker`, and composed-layer path checks pass |
| Sample import | One project contains the updated language, model, views, and Omniverse codegen project |
| Compatibility | Existing sample output remains grounded; Sirius sidecar restores Z or the report warns when absent |

Manual Isaac Sim release gate on a supported NVIDIA environment:

- [ ] Open the composed stage with no missing references or unit/up-axis warning.
- [ ] Confirm grounded equipment remains at the same floor poses as before.
- [ ] Confirm the airborne drone's base is 4.5 m above the floor and the landed
  drone's base is at 0 m.
- [ ] Press Play and confirm the kinematic drone remains at altitude while normal
  physics and ground-robot modes still work.
- [ ] Compare browser and Isaac Sim screenshots from two known camera angles and
  record the Isaac Sim/OpenUSD versions in the QA report.

## Suggested Delivery Sequence

1. **PR A, spatial contract and persistence:** shared types, axis helpers,
   normalizers, API validation, Z-preserving merges, and migration tests.
2. **PR B, authoring and constraints:** placement policy editor, 3D rendering,
   elevation controls/cues, camera framing, and 3D helpers.
3. **PR C, sample and generators:** InspectionDrone fixtures, USD asset,
   codegen context/templates, runtime loader, documentation, and automated USD
   checks.
4. **Release gate, Isaac Sim:** run the composed-stage verification on supported
   NVIDIA hardware and attach evidence without blocking repository-only tests.

This order keeps the risky persistence contract ahead of UI and generator work.
Do not update the sample to non-zero Z before the normalization and write-through
tests are in place, or ordinary 2D edits can erase the proof fixture.

## Definition of Done

- Existing projects load with every legacy spatial element at the same ground
  pose and no required database migration.
- A Modeler can create an adjustable aerial instance, edit X/Y/Z/yaw, save,
  reload, copy/export/import the project, and retain the exact pose.
- The Smart Warehouse project visibly demonstrates both airborne and landed
  drones alongside unchanged floor equipment.
- Static Python and layered Omniverse generators both emit the correct Z values,
  asset references, metadata, and kinematic physics opinions.
- Generated JSON, Python, and USD pass automated checks, and the external Isaac
  Sim Play test confirms the drone stays at its modeled elevation.
- Documentation says clearly that this phase supports aerial placement, not
  autonomous flight simulation.

## External References

- [OpenUSD `UsdGeomXformable` transform operations](https://openusd.org/release/api/class_usd_geom_xformable.html)
- [OpenUSD linear-unit metadata](https://openusd.org/release/api/class_usd_geom_linear_units.html)
- [Isaac Sim physics simulation fundamentals](https://docs.isaacsim.omniverse.nvidia.com/latest/physics/simulation_fundamentals.html)
- [NVIDIA `UsdPhysicsRigidBodyAPI` kinematic behavior](https://docs.omniverse.nvidia.com/kit/docs/usdrt.scenegraph/7.6.3/api/classusdrt_1_1_usd_physics_rigid_body_a_p_i.html)
