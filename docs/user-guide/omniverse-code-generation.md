# Omniverse Code Generation

This guide explains how to generate an NVIDIA Omniverse/OpenUSD scene from a
SpatialDSL Studio model by importing a code generation project JSON.

The current project is intentionally an importable example, not app-seeded
example data. That keeps the code generation feature generic: any team can
import a project JSON for a different target platform, DSL, or runtime without
changing the app bundle.

## Files

- Importable codegen project:
  `examples/codegen-projects/smart-warehouse-omniverse-project.json`
- Example source model:
  `frontend/src/examples/data/smart-warehouse-model.json`
- Example target metamodel:
  `frontend/src/examples/data/smart-warehouse-metamodel.json`

## What The Template Generates

The importable project contains one template:

- Template name: `Generate Omniverse USD Scene`
- Output file: `generate_warehouse_usd.py`
- Target metamodel ID: `10000000-0000-4000-8000-000000000100`

The generated Python script creates a `.usda` USD stage with:

- `/World` as the default prim
- a floor cube sized around the modeled warehouse
- grouped prims for:
  - `PathwayArea`
  - `Conveyor`
  - `OutputLocation`
  - `ChargingStation`
  - `MobileRobot`
- one placeholder cube per model element
- source metadata attributes such as `spatialDsl:sourceName`,
  `spatialDsl:className`, and source coordinates in millimeters

This is a first-stage scene-generation template. It does not implement robot
movement, path planning, OPC UA integration, physics tuning, or asset conversion.

## Why Placeholder Geometry

The Smart Warehouse model already stores useful 3D scene data:

- model class, through `modelElementId`
- element name, through `style.name`
- 3D position, through `presentation.position3D`
- Z rotation, through `presentation.rotationZ`
- size in millimeters, through `presentation.size3D`

The template maps those values into OpenUSD transforms and cube sizes. This gives
you a deterministic, inspectable USD scene before introducing asset conversion or
runtime simulation behavior.

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

## Set Up Omniverse Or Isaac Sim

For this first workflow, use NVIDIA Isaac Sim as the Omniverse runtime. The
generated script only needs the OpenUSD Python modules bundled with
Omniverse/Isaac Sim, so you do not need to write an Omniverse extension.

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
./python.sh /absolute/path/to/generate_warehouse_usd.py /absolute/path/to/warehouse_scene.usda
```

On Windows:

```powershell
python.bat C:\path\to\generate_warehouse_usd.py C:\path\to\warehouse_scene.usda
```

Expected terminal output:

```text
Generated USD scene: /absolute/path/to/warehouse_scene.usda
Elements: 25
```

The element count excludes the root `WarehouseSystem` object because the template
generates geometry for physical warehouse assets only.

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
   `/World/OutputLocation`, `/World/ChargingStation`, and
   `/World/MobileRobot`.

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

### The USD file opens but looks like simple boxes

Cause: this first template intentionally generates placeholder geometry.

Fix: this is expected. The next template iteration should reference converted
USD assets for robots, conveyors, charging stations, and pathway surfaces.

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

- Replace placeholder cubes with references to converted USD assets.
- Add a class-to-asset map such as `MobileRobot -> assets/mobile_robot.usd`.
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
