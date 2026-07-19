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
- Vendored CC0 demonstration assets:
  `examples/omniverse-assets/cc0-mini-vehicle-kit/`
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
- a referenced CC0 vehicle asset for each `MobileRobot` when the asset root is available
- a placeholder cube for unmapped classes or unavailable asset files
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

The template maps those values into OpenUSD transforms. `MobileRobot` elements
reference `cc0-mini-vehicle-kit/demo_forklift.usda`; all remaining classes use
deterministic cube geometry. If the asset root is missing, robots also fall back
to cubes and the script prints the unresolved path.

The included vehicle subset is CC0 and demonstrates USD composition, materials,
textures, instancing, Y-up to Z-up orientation, and scaling. It is not a
production autonomous mobile robot. See the asset directory's `SOURCE.md` for
provenance and the root-level `smart-warehouse-codegen-future-work.md` for the
production asset roadmap.

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

Isaac Sim's workstation application currently supports Windows 11 and Ubuntu
22.04/24.04 on a compatible NVIDIA RTX GPU. It does not run natively on macOS.
When using SpatialDSL Studio on a Mac, export the generator there, then move the
generator and asset directory to a supported Isaac Sim workstation or cloud
host before creating the final USD scene.

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

## Move A macOS Export To The Isaac Sim Host

Copy both of these items to the Windows or Linux machine:

```text
generate_warehouse_usd.py
examples/omniverse-assets/
```

For example, place them together as:

```text
spatialdsl-export/
  generate_warehouse_usd.py
  omniverse-assets/
```

Run the generator on that destination machine. The current template resolves
asset references while generating the scene, so copying only a `.usda` created
on another machine can leave references pointing at paths that do not exist on
the Isaac Sim host.

## Run In A Browser With NVIDIA Brev

NVIDIA does not run Isaac Sim directly inside the browser. NVIDIA Brev rents a
remote GPU instance, and the Isaac Launchable provides two browser tabs:

- a Visual Studio Code tab for files and terminal commands
- an Isaac Sim tab streamed from the GPU with WebRTC

Brev bills running instances by the hour. The current price is displayed before
deployment. Stop the instance when taking a break; stopped instances do not
incur compute charges, although a small storage charge can remain. Deleting the
instance stops all charges and permanently removes its files.

### 1. Export The Generator From SpatialDSL Studio

Follow `Import The Project` and `Generate The Python Script` above on the Mac.
Keep the downloaded file named:

```text
generate_warehouse_usd.py
```

### 2. Deploy The Isaac Launchable

1. Open NVIDIA's current Isaac Launchable instructions:

   ```text
   https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_advanced_cloud_setup_launchable.html
   ```

2. Open the `Isaac Launchable` link and create or sign in to an NVIDIA Brev
   account.
3. Review the displayed GPU, storage, provider, and hourly price.
4. Click `Deploy Launchable`.
5. Wait until the instance is running, built, and its setup script has
   completed. The first deployment and first shader warmup can take several
   minutes.
6. On the instance page, find `Using Secure Links` and open the shareable URL.
   Sign in again if prompted. This opens browser-based Visual Studio Code.

The preconfigured Launchable is the simplest first run. When creating a manual
Brev VM instead, NVIDIA currently recommends one L40S GPU. Avoid A100 for a
streamed session because it does not provide the NVENC encoder required by
Isaac Sim livestreaming.

### 3. Prepare The Export In Browser VS Code

Open a terminal in the browser-based VS Code and run:

```bash
cd /workspace
git clone --depth 1 https://github.com/micss-lab/SpatialDSLStudio.git
mkdir -p /workspace/spatialdsl-export
cp -R /workspace/SpatialDSLStudio/examples/omniverse-assets \
  /workspace/spatialdsl-export/omniverse-assets
```

In the VS Code Explorer, drag the downloaded `generate_warehouse_usd.py` from
the Mac into:

```text
/workspace/spatialdsl-export/
```

The directory should now contain:

```text
/workspace/spatialdsl-export/
  generate_warehouse_usd.py
  omniverse-assets/
```

### 4. Generate The USD Scene In The Cloud

In the VS Code terminal, use Isaac Sim's bundled Python:

```bash
ACCEPT_EULA=y /isaac-sim/python.sh \
  /workspace/spatialdsl-export/generate_warehouse_usd.py \
  /workspace/spatialdsl-export/warehouse_scene.usda \
  /workspace/spatialdsl-export/omniverse-assets
```

Expected output:

```text
Generated USD scene: /workspace/spatialdsl-export/warehouse_scene.usda
Elements: 25
Referenced assets: 2
```

Do not use the terminal's ordinary `python3`; it may not contain the `pxr`
modules required by the generator.

### 5. Start The Browser-Streamed Isaac Sim UI

Run the following command and leave it running:

```bash
ACCEPT_EULA=y /isaac-sim/runheadless.sh
```

Wait until the terminal reports that the application is ready. Copy the secure
VS Code URL into a new Chrome or Chromium tab and change the end of the URL to:

```text
/viewer/
```

For example:

```text
https://isaac.example-brev-host/viewer/
```

The page can display `Waiting for stream...` while Isaac Sim warms its shader
cache. Keep only one viewer tab connected to the instance.

In the streamed Isaac Sim UI:

1. Select `File > Open`.
2. Enter or browse to:

   ```text
   /workspace/spatialdsl-export/warehouse_scene.usda
   ```

3. Open `/World/MobileRobot` in the Stage tree and confirm that two vehicle
   references load.
4. Inspect the remaining class groups under `/World`; their boxes are expected
   placeholder geometry in the current template.

### 6. End The Paid Session

1. In Isaac Sim, select `File > Exit`.
2. Return to the Brev console.
3. Stop the instance and confirm its state changes to `Stopped`.
4. Download or push any files that must survive before deleting the instance.

Do not rely on closing the browser tab to stop billing. A Brev instance can
continue running after its VS Code and viewer tabs are closed.

## Run With Isaac Sim Python

The simplest route for a beginner is Isaac Sim's standalone Python environment.
NVIDIA documents `python.sh` as the launcher that sets the Isaac Sim/Omniverse
Python environment before running the packaged interpreter. On Windows, use
`python.bat`.

From your Isaac Sim installation directory:

```bash
./python.sh /absolute/path/to/spatialdsl-export/generate_warehouse_usd.py \
  /absolute/path/to/spatialdsl-export/warehouse_scene.usda \
  /absolute/path/to/spatialdsl-export/omniverse-assets
```

On Windows:

```powershell
python.bat C:\path\to\spatialdsl-export\generate_warehouse_usd.py C:\path\to\spatialdsl-export\warehouse_scene.usda C:\path\to\spatialdsl-export\omniverse-assets
```

Expected terminal output:

```text
Generated USD scene: /absolute/path/to/warehouse_scene.usda
Elements: 25
Referenced assets: 2
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

### Some elements still look like simple boxes

Cause: only `MobileRobot` currently has a real asset mapping. Other classes use
fallback geometry by design.

Fix: this is expected. Add reviewed assets to the class map for conveyors,
charging stations, output locations, and pathway surfaces.

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
