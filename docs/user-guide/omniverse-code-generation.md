# Omniverse Code Generation

This guide explains how to generate an NVIDIA Omniverse/OpenUSD scene from a
SpatialDSL Studio model by importing a code generation project JSON.

For a single continuous path that starts at metamodel import and ends with the
scene running on a cloud GPU, see
[End-to-End Walkthrough: Smart Warehouse to Isaac Sim on NVIDIA Brev](end-to-end-omniverse.md).
This guide is the deeper reference for the code generation and local-run parts of
that path.

The current project is intentionally an importable example, not app-seeded
example data. That keeps the code generation feature generic: any team can
import a project JSON for a different target platform, DSL, or runtime without
changing the app bundle.

## Files

- Importable codegen project:
  `examples/codegen-projects/smart-warehouse-omniverse-project.json`
- Versioned asset manifest and schema:
  `examples/omniverse-assets/asset-manifest.json`,
  `examples/omniverse-assets/asset-manifest.schema.json`
- Warehouse prop assets (authored, CC0, one per physical class):
  `examples/omniverse-assets/warehouse-kit/`
- Vendored CC0 vehicle assets (the mobile robot):
  `examples/omniverse-assets/cc0-mini-vehicle-kit/`
- Example source model:
  `frontend/src/examples/data/smart-warehouse-model.json`
- Example target metamodel:
  `frontend/src/examples/data/smart-warehouse-metamodel.json`

## What The Templates Generate

The importable project contains two templates:

- `Generate Omniverse USD Scene` (Python) produces `generate_warehouse_usd.py`,
  the static scene builder described below.
- `Generate Warehouse Layout` (JSON) produces `warehouse_layout.json`, the model
  data (robots, obstacles, pickups, drop-offs) read by the live navigation
  simulation. See `examples/omniverse-assets/warehouse_sim/README.md` for the
  simulation (an external OPC UA brain plus an Isaac Sim bridge, mirroring the
  Visual Components MAS architecture).

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
- a referenced USD asset for each physical class the manifest maps, when the
  asset root is available: reviewed `warehouse-kit` props for conveyors,
  charging stations, output locations, pathway areas, storage racks, and docks,
  and a CC0 vehicle for each `MobileRobot`
- a placeholder cube only for unmapped classes or unavailable asset files
- source metadata attributes such as `spatialDsl:sourceName`,
  `spatialDsl:className`, and source coordinates in millimeters

This remains a first-stage scene-generation template. It demonstrates real USD
references, but does not implement robot movement, path planning, OPC UA
integration, physics tuning, or production AMR behavior.

## Asset References And Fallback Geometry

The Smart Warehouse model already stores useful 3D scene data:

- model class, through `modelElementId`
- element name, through `style.name`
- 3D position, through `presentation.position3D`
- Z rotation, through `presentation.rotationZ`
- size in millimeters, through `presentation.size3D`

The template maps those values into OpenUSD transforms. Which asset each element
references is resolved through a versioned asset manifest rather than a hard-coded
map, so you can retarget assets without editing the template.

### Asset Manifest

`examples/omniverse-assets/asset-manifest.json` holds the class-to-asset mapping:

```json
{
  "version": 1,
  "defaults": {
    "MobileRobot": {
      "asset": "cc0-mini-vehicle-kit/demo_forklift.usda",
      "uniformScale": 0.01,
      "rotateXDeg": 90,
      "zOffsetM": 0.0
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
  - `uniform` (the default, used by the CC0 robot) applies `uniformScale` and
    `rotateXDeg` to a pre-sized asset without stretching it.
- `asset-manifest.schema.json` is the draft-07 JSON Schema for the manifest.

The frontend exposes `validateAssetManifest` and `resolveAssetForElement` in
`frontend/src/services/codegeneration/asset-manifest.service.ts` for validating a
manifest and resolving an element to its mapping (override first, then class
default).

At generation time the manifest values are also embedded in the generated script.
When the script runs, it loads `asset-manifest.json` from the asset root if
present and otherwise uses the embedded copy, so a locally edited manifest wins
over the baked-in defaults. By default every physical class is mapped: robots
reference the CC0 vehicle, and the other classes reference reviewed
`warehouse-kit` props. Any class without a mapping uses deterministic cube
geometry. If the asset root is missing, mapped elements also fall back to cubes,
and the script prints a warning naming the element and class.

The included vehicle subset is CC0 and demonstrates USD composition, materials,
textures, instancing, Y-up to Z-up orientation, and scaling. It is not a
production autonomous mobile robot. See the asset directory's `SOURCE.md` for
provenance.

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

## Generate The Python Script

1. In Code Generation, select:

   ```text
   Smart Warehouse Omniverse USD
   ```

2. Make sure the available model is the Smart Warehouse example model:

   ```text
   WarehouseModel
   ```

3. Click `Generate`.
4. Download the generated file:

   ```text
   generate_warehouse_usd.py
   ```

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

After the script writes `warehouse_scene.usda`, open the file in an Omniverse USD
viewer or Isaac Sim:

1. Launch Isaac Sim or an Omniverse Kit-based app.
2. Use `File > Open`.
3. Select the generated `warehouse_scene.usda`.
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

Cause: the asset root was not passed (or is wrong), so no `warehouse-kit` or CC0
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

Cause: the template skips the root `WarehouseSystem` instance and only emits
physical warehouse assets.

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
