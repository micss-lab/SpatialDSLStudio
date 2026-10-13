# Spatial Rules

Spatial rules are declarative constraints over where model elements are placed. They belong to the
language definition: a DSL designer declares them on the metamodel, next to OCL and JavaScript
constraints, and every model of that language is checked against them.

The same evaluator runs in two places and produces identical issues for the same model:

- browser validation (model validation dialog, the 2D and 3D view markers, and the view validation panel);
- the backend model validation engine, which the headless pipeline `validate-model` step uses.

OCL and JavaScript constraints remain available for anything the rule kinds below cannot express. They
can call the same geometry through the `spatial` helpers (see [Escape hatch](#escape-hatch-ocl-and-javascript-helpers)).

## Author a rule

1. Open a metamodel in the visual editor.
2. Open the **Constraints** tab in the right sidebar. The **Spatial Rules** section lists the
   metamodel's rules below the class constraints (it is visible with or without a selected class).
3. Click **Add Rule** and fill in the dialog. The distance field appears only for kinds that use it,
   labelled for that kind.
4. Click **Add**. The rule is saved with the metamodel.

To see violations, open a view of a model and click the refresh button of the validation panel. Offending
elements get an error, warning, or info marker in 2D and in 3D.

## Rule fields

| Field | Meaning |
| --- | --- |
| `name` | Shown as the prefix of every issue message. |
| `kind` | `noOverlap`, `minClearance`, `maxDistance`, `within`, or `adjacentTo`. |
| `sourceClassId` | Metaclass whose instances are checked. Instances of subclasses are included. |
| `targetClassId` | Metaclass the source instances are compared with (subclasses included). May equal the source class. |
| `distanceMm` | Required for `minClearance`, `maxDistance`, and `adjacentTo`; the margin for `within` (default 0). Must be zero or greater. |
| `mode` | `plan` (footprints only) or `volume` (footprints and elevation). Default `volume`. |
| `severity` | `error`, `warning`, or `info`. |
| `message` | Optional custom text. Placeholders: `{source}`, `{target}`, `{distance}`, `{rule}`. |
| `enabled` | Default `true`; disabled rules are skipped. |

## Geometry

All rules use the Phase 10 coordinate contract: one right-handed, Z-up world frame in millimetres.

- `presentation.position3D.x/y` is the element's plan-view centre and `position3D.z` its base elevation.
- `size3D.widthMm` runs along the element's local X axis, `heightMm` along its local Y axis, and
  `depthMm` is the vertical extent.
- `presentation.rotationZ` is the yaw in degrees about +Z. Positive values turn the element
  counter-clockwise seen from above, the same sign the 3D editor and OpenUSD `xformOp:rotateZ` use.

Each placed element is therefore a vertical prism: its footprint is the rectangle `widthMm x heightMm`
centred on `(x, y)` and turned by the yaw, extruded over `[z, z + depthMm]`.

An element is **placed** when it has a valid `presentation.position3D` and resolvable extents. Extents
come from `presentation.size3D`; when an element has none, the metaclass default
`concreteSyntax.three_d.defaultSizeMm` is used, inherited along `superTypes` like other notation (the first
ancestor with 3D notation wins). Elements that are not placed are skipped and never satisfy an "exists"
clause.

Rules read the 3D pose, not the 2D diagram position. Moving or rotating an element in the 3D view, by
dragging it or with the **Position & Rotation** fields of the properties panel, changes the pose. A 2D
move changes it only for elements whose 2D position equals their 3D plan position; the bundled examples
draw schematic 2D layouts, so their 2D moves do not.

Validation does not depend on which view is open. Representation-level and viewpoint-level
`defaultSizeMm` overrides, and the renderer's built-in 500 x 800 x 200 mm placeholder, are therefore not
used for rules. Give elements an explicit `size3D`, or set a metaclass default, when a rule should see them.

## Semantics

S is the set of placed instances of the source class (subclasses included) and T the same for the target
class.

| Kind | Holds when | Quantifier | Issues reported |
| --- | --- | --- | --- |
| `noOverlap` | no two distinct elements intersect | for all a in S, b in T, a != b | one per offending unordered pair, attached to both elements |
| `minClearance(d)` | the gap between distinct elements is at least d | for all a in S, b in T, a != b | one per offending unordered pair, attached to both elements |
| `maxDistance(d)` | each source has a target whose centre is within d | for all a in S, exists b in T | one per unsatisfied source |
| `within(margin)` | each source lies inside a target footprint shrunk by the margin on every side | for all a in S, exists b in T | one per unsatisfied source |
| `adjacentTo(tol)` | each source has a distinct target with a gap of at most tol | for all a in S, exists b in T, b != a | one per unsatisfied source |

Mode details:

| | `plan` | `volume` (default) |
| --- | --- | --- |
| overlap | footprints intersect | footprints intersect and vertical intervals intersect |
| gap | minimum distance between footprints | `sqrt(planGap^2 + verticalGap^2)`, the exact distance between the prisms |
| centre distance | between plan centres | between volume centres (plan centre at mid elevation) |
| within | footprint of a inside the shrunk footprint of b | as `plan`, and the vertical interval of a inside that of b (the margin applies in plan only) |

Comparison details:

- Touching does not count as overlapping: footprints that share only an edge or a corner, or volumes
  that share only a face, do not overlap. Their gap is 0.
- `minClearance` is violated when the gap is strictly less than d. `maxDistance`, `within`, and
  `adjacentTo` accept values equal to the limit.
- A tolerance of 1e-6 mm absorbs floating-point noise from rotation.
- For `within` and `maxDistance`, a source may be satisfied by itself when its class is also a target
  class (an element lies inside its own footprint and is at distance 0 from itself). `adjacentTo` always
  needs a different element.

## Issues

Every issue carries `constraintId` (the rule ID) and `location` (`spatialRules.<kind>`, for example `spatialRules.noOverlap`).

- Pair kinds (`noOverlap`, `minClearance`) report each unordered pair once, on the source element, with
  the other element in `relatedElementIds`. Views mark both elements, and the issue stays visible in a
  view that shows only one of them.
- Exists kinds (`maxDistance`, `within`, `adjacentTo`) report each unsatisfied source element.
- A rule that is misconfigured (unknown class, missing or negative distance) produces one error issue
  without an element, and is not evaluated.
- Issues follow rule order, then model element order, so results are deterministic.

Default messages name the elements and the measured value, for example
`Storage rack aisle width: Storage Rack is 500 mm from Storage Rack #2; at least 1500 mm is required.`

## Example: Smart Warehouse

The bundled Smart Warehouse metamodel declares an abstract `FixedEquipment` superclass of `Conveyor`,
`ChargingStation`, `StorageRack`, and `Dock`, and four rules. The bundled model satisfies all of them.

| Rule | Kind | Source | Target | Distance | Mode | Severity |
| --- | --- | --- | --- | --- | --- | --- |
| Fixed equipment must not overlap | `noOverlap` | FixedEquipment | FixedEquipment | | plan | error |
| Storage rack aisle width | `minClearance` | StorageRack | StorageRack | 1500 mm | plan | error |
| Charging station on a pathway | `adjacentTo` | ChargingStation | PathwayArea | 500 mm | plan | warning |
| Drone clearance from racks | `minClearance` | InspectionDrone | StorageRack | 1000 mm | volume | error |

To see a violation, open a warehouse view in 3D, move or rotate one conveyor into the other, and refresh
the validation panel.

## Example: Smart Home

The Smart Home example (project starter "Include Smart Home starter") places devices in a small home. A
`Home` contains `Room` elements and devices. `Hub`, `SmokeDetector`, `MotionSensor`, `Thermostat`,
`Camera`, and `SmartPlug` specialize the abstract `Device`, so one rule covers every kind of device. Each
device references its room and its hub. The bundled model has five rooms (hallway, living room, kitchen,
bedroom, bathroom), one hub, and 12 further devices, and satisfies all four rules.

| Rule | Kind | Source | Target | Distance | Mode | Severity |
| --- | --- | --- | --- | --- | --- | --- |
| Rooms do not overlap | `noOverlap` | Room | Room | | plan | error |
| Device inside a room | `within` | Device | Room | 0 mm | plan | error |
| Smoke detector away from walls | `within` | SmokeDetector | Room | 300 mm | plan | error |
| Device in hub range | `maxDistance` | Device | Hub | 10,000 mm | volume | error |

The distances illustrate the rule kinds; they are not taken from building codes or product
specifications. The hub is a device as well, so it must be inside a room, and it is in range of itself.

Its representations keep rooms grounded as thin floor slabs and give devices adjustable elevation with
per-class defaults (hub 900 mm, smoke detector 2,400 mm, motion sensor 2,100 mm, thermostat 1,500 mm,
camera 2,200 mm, smart plug 300 mm; 0 to 3,000 mm). The "Smart Home Device Configuration" generator
writes `device-configuration.json` with each device's ID, type, room, position in metres (`z` is its
mounting height), and yaw.

To see a violation, open the `Device Placement 3D` view, switch to 3D, and move the living-room smoke
detector `SD-LIV` toward the hallway: with its Y position below 860 mm it is closer than 300 mm to the
living-room wall, and at 500 mm it sits on the wall and is inside no room. Refresh the validation panel
to see the rule errors.

## Escape hatch: OCL and JavaScript helpers

JavaScript and OCL constraints can call the same geometry through a `spatial` namespace:

- `spatial.overlaps(a, b)` and `spatial.overlaps3D(a, b)`
- `spatial.clearance(a, b)` and `spatial.clearance3D(a, b)`
- `spatial.boundsOf(e)` and `spatial.bounds3DOf(e)`

These helpers honour `rotationZ`. `boundsOf` and `bounds3DOf` return the axis-aligned envelope of the
rotated footprint. The helpers read `presentation.size3D` only; they do not apply metaclass defaults.

## Persistence and interoperability

- Rules are stored in the metamodel's `spatialRules` JSON column and travel with JSON import and export.
- Project checkpoints include them; restoring a checkpoint restores them.
- Metamodel evolution reports a blocker when a rule still references a class that the new version removes.
  Deleting a class in the editor also deletes the rules that reference it.
- Ecore export writes the rules as an `EPackage` annotation with source `spatialdsl/spatialRules`: one
  detail per rule, keyed by rule name, whose value is a JSON object naming the classes. Ecore import reads
  the annotation back and resolves the class names. EMF and Sirius keep the annotation but do not evaluate
  it.

## Cost

Pair kinds compare every source with every target, O(|S| x |T|), with an axis-aligned envelope test
before the exact oriented test. Exists kinds stop at the first satisfying target.

## Relevant files

- `shared/spatial-geometry.ts` and `shared/spatial-rules.ts`: geometry and evaluator used by the backend.
- `frontend/src/services/spatial/spatial-geometry.ts` and `frontend/src/services/spatial/spatial-rules.ts`:
  the frontend mirror. A parity test keeps both copies identical below their imports.
- `frontend/src/components/metamodel/SpatialRulesEditor.tsx`: the Spatial Rules section and dialog.
- `backend/src/services/pipeline/model-validation.engine.ts`: headless validation.
- `frontend/src/services/model/model-validation.service.ts`: browser validation.

## Related docs

- [Metamodels](metamodels.md)
- [Views (2D and 3D)](diagrams.md)
- [Project Lifecycle](project-lifecycle.md)
- [Data Model](../reference/data-model.md)
