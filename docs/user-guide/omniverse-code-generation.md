# Omniverse Code Generation

This guide explains how to generate an NVIDIA Omniverse/OpenUSD scene from a
SpatialDSL Studio model by importing a code generation project JSON.

For a single continuous path that starts at metamodel import and ends with the
scene running on a cloud GPU, see
[End-to-End Walkthrough: Smart Warehouse to Isaac Sim on NVIDIA Brev](end-to-end-omniverse.md).
This guide is the deeper reference for the code generation and local-run parts of
that path.

When creating a Studio Project, enable `Include Smart Warehouse starter` to
install the metamodel, model, viewpoints, saved views, and both generator
configurations into that one project. The standalone project JSON remains
importable for existing projects and for teams that want only the Omniverse
target.

## Files

- Importable codegen project:
  `examples/codegen-projects/smart-warehouse-omniverse-project.json`
- Project-starter copy:
  `frontend/src/examples/data/smart-warehouse-omniverse-project.json`
- Versioned asset manifest and schema:
  `examples/omniverse-assets/asset-manifest.json`,
  `examples/omniverse-assets/asset-manifest.schema.json`
- Warehouse prop assets (authored, CC0, one per physical class):
  `examples/omniverse-assets/warehouse-kit/`
- Normalized MIT-licensed NVIDIA F1TENTH AMR, collision, and articulation layers:
  `examples/omniverse-assets/nvidia-f1tenth-amr/`
- Legacy CC0 vehicle composition demonstrator:
  `examples/omniverse-assets/cc0-mini-vehicle-kit/`
- Example source model:
  `frontend/src/examples/data/smart-warehouse-model.json`
- Example target metamodel:
  `frontend/src/examples/data/smart-warehouse-metamodel.json`

## What The Templates Generate

The importable project contains six templates:

- `Generate Omniverse USD Scene` (Python) produces `generate_warehouse_usd.py`,
  the static scene builder described below.
- `Generate Warehouse Layout` (JSON) produces `warehouse_layout.json`, the model
  data (robots, obstacles, pickups, drop-offs) read by the live navigation
  simulation. See `examples/omniverse-assets/warehouse_sim/README.md` for the
  simulation (an external OPC UA brain plus an Isaac Sim bridge, mirroring the
  Visual Components MAS architecture).
- Four plain-text OpenUSD templates produce `warehouse_layout.usda`,
  `warehouse_assets.usda`, `warehouse_physics.usda`, and
  `warehouse_simulation.usda`. The last file composes the first three in
  layout/assets/physics strength order.

Both target metamodel ID `10000000-0000-4000-8000-000000000100`. The rest of this
guide covers the scene script.

The generated Python script creates a `.usda` USD stage with:

- `/World` as the default prim
- a floor cube sized around the modeled warehouse
- grouped prims for:
  - `PathwayArea`
  - `Conveyor`
  - `OutputLocation`
  - `ChargingStation`
  - `MobileRobot`
  - `StorageRack`
  - `Dock`
  - `InspectionDrone`
- a referenced USD asset for each physical class the manifest maps, when the
  asset root is available: reviewed `warehouse-kit` props for conveyors,
  charging stations, output locations, pathway areas, storage racks, and docks,
  and the normalized NVIDIA F1TENTH AMR for each `MobileRobot`
- a placeholder cube only for unmapped classes or unavailable asset files
- source metadata attributes such as `spatialDsl:sourceName`,
  `spatialDsl:className`, and source coordinates in millimeters

The legacy Python builder remains useful for its explicit missing-asset cube
fallback. The layered root adds a real physics scene, proxy colliders, robot
mass/body schemas, and separated asset opinions. Robot movement, planning, and
OPC UA remain in the external brain/Isaac bridge.

## Asset References And Fallback Geometry

The Smart Warehouse model already stores useful 3D scene data:

- model class, through `modelElementId`
- element name, through `style.name`
- 3D position, through `presentation.position3D = { x, y, z }`; Z is base
  elevation above the project datum
- Z rotation, through `presentation.rotationZ`
- size in millimeters, through `presentation.size3D`

SpatialDSL coordinates are right-handed, Z-up millimetres. OpenUSD translations
are `[x/1000, y/1000, z/1000]` metres and `rotationZ` remains yaw about Z.
Persisted extents map X=`widthMm`, Y=`heightMm`, Z=`depthMm`. Fitted/fallback
geometry is centered at `(baseZMm + depthMm / 2) / 1000`; a base-normalized
referenced asset is translated to `baseZMm / 1000`.

The template maps those values into OpenUSD transforms. Which asset each element
references is resolved through a versioned asset manifest rather than a hard-coded
map, so you can retarget assets without editing the template.

### Asset Manifest

`examples/omniverse-assets/asset-manifest.json` holds the class-to-asset mapping:

```json
{
  "version": 2,
  "defaults": {
    "MobileRobot": {
      "asset": "nvidia-f1tenth-amr/f1tenth_amr_collision.usda",
      "articulationAsset": "nvidia-f1tenth-amr/f1tenth_amr_articulation.usda",
      "uniformScale": 1,
      "rotateXDeg": 0,
      "zOffsetM": 0.0,
      "license": "MIT",
      "metersPerUnit": 1,
      "upAxis": "Z",
      "forwardAxis": "+X",
      "bodyMode": "kinematic",
      "massKg": 3.1,
      "wheelRadiusM": 0.057,
      "wheelSeparationM": 0.324,
      "leftWheelJoint": "Drive/LeftWheelJoint",
      "rightWheelJoint": "Drive/RightWheelJoint"
    },
    "StorageRack": {
      "asset": "warehouse-kit/storage_rack.usda",
      "scaleMode": "fit"
    }
  },
  "overrides": {}
}
```

- `defaults` maps a class name to an asset mapping (asset path relative to the
  asset root, plus optional scale settings).
- `overrides` maps a specific element name to an asset mapping, and takes
  precedence over the class default. Use it when one instance needs a different
  asset from the rest of its class.
- `scaleMode` chooses how the asset is scaled:
  - `fit` (used by the `warehouse-kit` props) scales a 1 m unit asset to each
    element's modeled length, width, and height, so instances match their
    modeled dimensions. Author `fit` assets normalized to a 1 x 1 x 1 m box
    centered on XY with the base at `z = -0.5`.
  - `uniform` (the default, used by the normalized AMR) applies `uniformScale` and
    `rotateXDeg` to a pre-sized asset without stretching it.
- `asset-manifest.schema.json` is the draft-07 JSON Schema for the manifest.
- `zOffsetM` corrects an asset's authored pivot after modeled base elevation is
  applied. It is not instance elevation and must not be used to make a grounded
  model appear airborne.

The project-authored `warehouse-kit/inspection_drone.usda` is metre-scale,
Z-up, and base-normalized. Generated layout, asset, and physics layers place
both sample drones under `/World/InspectionDrone`; the airborne instance is at
4.5 m and the landed instance at 0 m. Their rigid bodies are kinematic and use
separate proxy colliders, so gravity does not drop them when Play starts.
This preserves modeled aerial placement only: it does not simulate rotors,
flight dynamics, sensors, autonomous navigation, or a drone control loop.

The frontend exposes `validateAssetManifest` and `resolveAssetForElement` in
`frontend/src/services/codegeneration/asset-manifest.service.ts` for validating a
manifest and resolving an element to its mapping (override first, then class
default).

At generation time the manifest values are also embedded in the generated script.
When the script runs, it loads `asset-manifest.json` from the asset root if
present and otherwise uses the embedded copy, so a locally edited manifest wins
over the baked-in defaults. By default every physical class is mapped: robots
reference the normalized F1TENTH AMR, and the other classes reference reviewed
`warehouse-kit` props. Any class without a mapping uses deterministic cube
geometry. If the asset root is missing, mapped elements also fall back to cubes,
and the script prints a warning naming the element and class.

The F1TENTH directory records its upstream NVIDIA revision and MIT terms, uses
metre/Z-up/+X-forward normalization, and separates materials, visuals, collision,
and optional articulation. The CC0 vehicle remains a legacy composition fixture.
Run `validate_asset_manifest.py` to verify manifest roots and every local USDA
dependency resolve inside the asset root.

## Import The Project

1. Start the app.
2. Open `Code Generation`.
3. Open the `Projects` tab.
4. Click `Import Project`.
5. Select:

   ```text
   examples/codegen-projects/smart-warehouse-omniverse-project.json
   ```

6. The imported project appears as a normal user project named:

   ```text
   Smart Warehouse Omniverse USD
   ```

The importer accepts a single project object, an array of projects, or an object
with a `projects` array. Imported projects are stored as user projects, not
example projects. If a project or template ID collides with an existing project,
the importer regenerates IDs to avoid overwriting existing work.

## Generate The Scene Bundle

1. In Code Generation, select:

   ```text
   Smart Warehouse Omniverse USD
   ```

2. Make sure the available model is the Smart Warehouse example model:

   ```text
   WarehouseModel
   ```

3. Click `Generate`.
4. Download all generated files. The primary runtime inputs are:

   ```text
   warehouse_layout.json
   warehouse_layout.usda
   warehouse_assets.usda
   warehouse_physics.usda
   warehouse_simulation.usda
   ```

   `generate_warehouse_usd.py` is also emitted as the backwards-compatible
   single-stage builder with visible cube fallbacks for missing assets.

If generation returns no files, check that the Smart Warehouse model and
metamodel are loaded and that the imported project targets the Smart Warehouse
metamodel ID.

## Set Up Isaac Sim

For this first workflow, use NVIDIA Isaac Sim as the Omniverse runtime. The
generated script only needs the OpenUSD Python modules bundled with
Omniverse/Isaac Sim, so you do not need to write an Omniverse extension.

No local GPU? Run Isaac Sim on a cloud GPU through NVIDIA Brev instead of a
workstation install. The
[End-to-End Walkthrough](end-to-end-omniverse.md#stage-5-register-on-nvidia-brev-and-launch-isaac-sim)
covers registering on Brev, launching Isaac Sim, uploading the script and assets,
and running it. The rest of this section covers the local workstation route.

1. Check the current Isaac Sim requirements:

   ```text
   https://docs.isaacsim.omniverse.nvidia.com/latest/installation/requirements.html
   ```

2. Download Isaac Sim using NVIDIA's current download instructions:

   ```text
   https://docs.isaacsim.omniverse.nvidia.com/latest/installation/download.html
   ```

3. Follow the workstation installation guide for your operating system:

   ```text
   https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_workstation.html
   ```

4. Confirm the installation folder contains the standalone Python launcher:

   - Linux: `python.sh`
   - Windows: `python.bat`

The generated `generate_warehouse_usd.py` script imports `pxr`, so it must run
inside an Omniverse/Isaac Sim Python environment. Running it with system Python
will usually fail with:

```text
ModuleNotFoundError: No module named 'pxr'
```

That error means the script is correct, but the wrong Python interpreter was
used.

## Validate And Run The Layered Root

Keep the generated four `.usda` files together and place or link the repository's
`examples/omniverse-assets` directory beside them as `omniverse-assets`. Validate
the complete composition before opening Isaac Sim:

```bash
usdchecker warehouse_layout.usda
usdchecker warehouse_assets.usda
usdchecker warehouse_physics.usda
usdchecker warehouse_simulation.usda
usdcat -l warehouse_simulation.usda
```

Open `warehouse_simulation.usda` directly for inspection. For the live OPC UA
simulation, pass it to the bridge with `--scene`; select kinematic control by
default, `--control-mode dynamic` for rigid-body velocity control, or
`--articulation` for the manifest-defined differential wheel drives. The bridge
authors runtime changes into a session layer, so generated layers stay reusable.

## Run With Isaac Sim Python

The simplest route for a beginner is Isaac Sim's standalone Python environment.
NVIDIA documents `python.sh` as the launcher that sets the Isaac Sim/Omniverse
Python environment before running the packaged interpreter. On Windows, use
`python.bat`.

From your Isaac Sim installation directory:

```bash
./python.sh /absolute/path/to/generate_warehouse_usd.py \
  /absolute/path/to/warehouse_scene.usda \
  /absolute/path/to/SpatialDSLStudio/examples/omniverse-assets
```

On Windows:

```powershell
python.bat C:\path\to\generate_warehouse_usd.py C:\path\to\warehouse_scene.usda C:\path\to\SpatialDSLStudio\examples\omniverse-assets
```

Expected terminal output:

```text
Generated USD scene: /absolute/path/to/warehouse_scene.usda
Elements: 28
Referenced assets: 28
```

The element count excludes the root `WarehouseSystem` object because the template
generates geometry for physical warehouse assets only.

The asset-root argument is optional. Without it, the script looks for an
`omniverse-assets` directory beside the generated script and uses cube fallbacks
when the mapped file is unavailable.

## Verify The Generated USD File

After the command finishes, check that the output file exists:

```bash
ls -lh /absolute/path/to/warehouse_scene.usda
```

On Windows PowerShell:

```powershell
Get-Item C:\path\to\warehouse_scene.usda
```

The file should be a text USD layer. If you open it in a text editor, you should
see `/World`, `/World/Floor`, and class groups such as `/World/MobileRobot`.

## Open The Scene

Open either the legacy `warehouse_scene.usda` or the preferred layered
`warehouse_simulation.usda` in an Omniverse USD viewer or Isaac Sim:

1. Launch Isaac Sim or an Omniverse Kit-based app.
2. Use `File > Open`.
3. Select the generated `warehouse_simulation.usda` (or legacy single stage).
4. Inspect `/World/PathwayArea`, `/World/Conveyor`,
   `/World/OutputLocation`, `/World/ChargingStation`,
   `/World/MobileRobot`, `/World/StorageRack`, and `/World/Dock`.

## Alternative: Run From Kit With `--exec`

Omniverse Kit also supports running Python scripts from the command line using
`--exec`. The exact executable depends on the Kit app you have installed, but
the command shape is:

```bash
kit.exe --exec "/absolute/path/to/generate_warehouse_usd.py /absolute/path/to/warehouse_scene.usda"
```

Use this path only after you know which Kit executable/application you are using.
For a first run, Isaac Sim's `python.sh` or `python.bat` is usually simpler.

## Common Omniverse-Side Issues

### `No module named 'pxr'`

Cause: the script was run with system Python.

Fix: run the generated script with Isaac Sim's `python.sh` or `python.bat`.

### Everything looks like plain boxes

Cause: the asset root was not passed (or is wrong), so no `warehouse-kit` or F1TENTH
assets resolved and every element fell back to a cube.

Fix: pass `examples/omniverse-assets` as the third script argument. Every physical
class is mapped by default, so with a valid asset root you should see props, not
bare boxes. To change a class's geometry, edit its entry in `asset-manifest.json`
under `defaults` (per class) or `overrides` (per element).

### `Asset not found; using placeholder`

Cause: the asset-root argument does not point to
`examples/omniverse-assets`, or the asset directory was not copied beside the
generated script.

Fix: pass the repository asset directory as the second script argument. Keep the
vendored directory structure intact because its layers use relative references.

### The scene opens far from the camera

Cause: the model uses millimeter-scale warehouse coordinates, which are converted
to meters in USD. The layout can still be larger than the default camera view.

Fix: in Isaac Sim, frame all geometry from the viewport or select `/World` and
frame the selection.

### Generated element count is lower than model element count

Cause: the template skips semantic-only controller, task, product, and root
instances and emits the 30 physical warehouse assets, including two inspection
drones.

Fix: this is expected for the current scene template.

## Template Extension Points

The current project JSON is meant to be edited or copied for other targets.
Common next changes:

- Replace remaining placeholder cubes with references to reviewed USD assets.
- Extend `asset-manifest.json` with more class defaults or per-element overrides.
- Emit physics APIs and collision approximations.
- Emit a second script for robot motion or event logic.
- Generate separate USD layers, for example:
  - `warehouse_layout.usda`
  - `warehouse_assets.usda`
  - `warehouse_simulation.usda`

Do not put Omniverse-specific assumptions into the core codegen system unless
multiple templates need the same generic capability. Prefer keeping target logic
inside importable codegen projects.

## References

- Isaac Sim Python environment:
  https://docs.isaacsim.omniverse.nvidia.com/latest/python_scripting/manual_standalone_python.html
- Isaac Sim download:
  https://docs.isaacsim.omniverse.nvidia.com/latest/installation/download.html
- Isaac Sim workstation installation:
  https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_workstation.html
- Omniverse Kit scripting:
  https://docs.omniverse.nvidia.com/kit/docs/kit-manual/latest/guide/python_scripting.html
- OpenUSD `UsdStage::CreateNew`:
  https://openusd.org/release/api/class_usd_stage.html
