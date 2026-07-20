# End-to-End Walkthrough: Smart Warehouse to Isaac Sim on NVIDIA Brev

This walkthrough runs the Smart Warehouse sample through the entire pipeline, from
importing the domain language to running the generated scene in NVIDIA Isaac Sim
on a cloud GPU:

1. Import the metamodel (the domain language).
2. Create the model (instances of the language).
3. Create a view (2D/3D projection of the model).
4. Generate the Omniverse/OpenUSD scene script and the warehouse layout.
5. Register on NVIDIA Brev and launch Isaac Sim.
6. Upload the generated files and asset directory to the instance.
7. Run the scene script and view the static scene.
8. Run the live navigation simulation (moving robots with an external MAS brain).

Each stage links to the deeper reference guide for that feature. The goal here is
one continuous path that goes from the model to robots navigating a live scene.

## Quick Path (TL;DR)

In SpatialDSL Studio:

1. `Metamodels > Import` -> `frontend/src/examples/data/smart-warehouse-metamodel.json`
2. `Models > Import` -> `frontend/src/examples/data/smart-warehouse-model.json`
3. `Code Generation > Projects > Import Project` ->
   `examples/codegen-projects/smart-warehouse-omniverse-project.json`
4. Select the project, model `WarehouseModel`, click `Generate`, download
   `generate_warehouse_usd.py` and `warehouse_layout.json`.

On [NVIDIA Brev](https://developer.nvidia.com/brev): deploy the
[Isaac Sim Launchable](https://github.com/isaac-sim/isaac-launchable), open the
terminal, then:

```bash
git clone <your-repo-url> SpatialDSLStudio
cd SpatialDSLStudio/examples/omniverse-assets/warehouse_sim
# drop your two downloaded files here (or keep the committed samples)
/isaac-sim/python.sh -m pip install asyncua

# static scene check (generate_warehouse_usd.py placed in this directory)
/isaac-sim/python.sh generate_warehouse_usd.py ~/warehouse_scene.usda ..
# -> File > Open ~/warehouse_scene.usda in the streamed viewer

# live simulation (two terminals)
python3 warehouse_brain.py --layout warehouse_layout.json                  # terminal 1
/isaac-sim/python.sh run_warehouse_sim.py --layout warehouse_layout.json \
  --asset-root .. --endpoint opc.tcp://127.0.0.1:4840/warehouse/mas       # terminal 2
```

Robots ferry between conveyors and the output, avoid each other, and divert to
chargers when low. Details for every step are below.

## What You Will Build

The sample generates a `.usda` USD stage of a warehouse with a floor, pathway
areas, conveyors, output locations, charging stations, mobile robots, storage
racks, and a loading dock. Every physical class resolves to a referenced USD
asset (a CC0 vehicle for robots, reviewed `warehouse-kit` props for the rest);
elements fall back to cubes only when the asset root is missing. The model also
carries
a control layer (a `WarehouseController`, `Task`, and `Product` entities) that
enriches the model and the generated MAS configuration but is not rendered as
scene geometry. This is a first-stage scene, not a full physics or navigation
simulation. See [Omniverse Code Generation](omniverse-code-generation.md) for the
scope and extension points.

## Prerequisites

- SpatialDSL Studio running (see [Local Setup](../getting-started/local-setup.md)
  or [Docker Setup](../getting-started/docker-setup.md)).
- A local clone of this repository, so you have the sample files and the asset
  directory `examples/omniverse-assets/`.
- An NVIDIA account for [NVIDIA Brev](https://developer.nvidia.com/brev). Cloud
  GPU time is billed by NVIDIA, so review current pricing before you deploy.
- A Chromium-based browser (Isaac Sim livestreaming targets Chromium).

## Sample Files

- Target metamodel: `frontend/src/examples/data/smart-warehouse-metamodel.json`
- Source model: `frontend/src/examples/data/smart-warehouse-model.json`
- Codegen project: `examples/codegen-projects/smart-warehouse-omniverse-project.json`
- Asset directory: `examples/omniverse-assets/`
  - Asset manifest: `examples/omniverse-assets/asset-manifest.json`
  - Manifest schema: `examples/omniverse-assets/asset-manifest.schema.json`
  - Vendored CC0 assets: `examples/omniverse-assets/cc0-mini-vehicle-kit/`

## Stage 1: Import the Metamodel

The metamodel is the domain language for the warehouse. Reference:
[Metamodels](metamodels.md).

1. Open `Metamodels` from navigation.
2. Click `Import` on the metamodels list panel.
3. Select `frontend/src/examples/data/smart-warehouse-metamodel.json`.
4. Confirm the import and open the metamodel to review its classes. Physical
   classes: `WarehouseSystem`, `Conveyor`, `MobileRobot`, `PathwayArea`,
   `OutputLocation`, `ChargingStation`, `StorageRack`, and `Dock`. Control-layer
   classes: `WarehouseController`, `Task`, and `Product`.

The metamodel ID used by the sample is
`10000000-0000-4000-8000-000000000100`. The codegen project targets this ID, so
importing this metamodel is what makes the project generate output later.

## Stage 2: Create the Model

The model holds the instances that become scene elements. Reference:
[Models](models.md).

1. Open `Models` from navigation.
2. Click `Import` and select
   `frontend/src/examples/data/smart-warehouse-model.json`.
3. Confirm the import. The model `WarehouseModel` appears in the list and
   conforms to the Smart Warehouse metamodel from Stage 1.

Each element already carries the spatial data the scene needs: 3D position, Z
rotation, and size in millimeters, stored on the element presentation. You can
open the model to inspect or adjust element attributes before generating.

## Stage 3: Create a View

A view is a 2D/3D projection of the model. It is where you arrange placement and
confirm the layout before generating. Reference: [Views (2D and 3D)](diagrams.md).

1. Open `Views` from navigation.
2. Click `Create View`.
3. Enter a name, select the `WarehouseModel` model, and open the view.
4. Use `Add all` to include every model element, or drag elements from the
   palette.
5. Switch to `3D Mode` to check spatial placement. Dragging a node writes its
   position back to the model element, so the layout you see here is the layout
   the generated scene uses.

A view is optional for generation (you can generate directly from the model),
but it is the recommended way to confirm placement, and you can open code
generation directly from a view card.

## Stage 4: Generate the Omniverse Script

Reference: [Code Generation](code-generation.md) and
[Omniverse Code Generation](omniverse-code-generation.md).

1. Open `Code Generation`.
2. Open the `Projects` tab and click `Import Project`.
3. Select `examples/codegen-projects/smart-warehouse-omniverse-project.json`. The
   project appears as `Smart Warehouse Omniverse USD`.
4. Select the `Smart Warehouse Omniverse USD` project and confirm the available
   model is `WarehouseModel`.
5. Click `Generate`.
6. In the `Generated Files` tab, download both generated files:
   - `generate_warehouse_usd.py` (the static scene builder), and
   - `warehouse_layout.json` (the model data the live simulation reads).

Keep the repository asset directory `examples/omniverse-assets/` handy. The
generated script references it (through the asset manifest) to place real
geometry, and falls back to cubes when it is missing. That directory also
contains `warehouse_sim/` (the navigation brain and Isaac Sim bridge used in
Stage 8).

### Optional: Verify Locally Before the Cloud

You can confirm the generated script is well formed without a GPU. The script
imports `pxr` (the OpenUSD Python modules) only when it runs, so a syntax check
with system Python is safe:

```bash
python3 -m py_compile generate_warehouse_usd.py
```

No output means the script compiled cleanly. Running it with system Python will
report `ModuleNotFoundError: No module named 'pxr'`, which is expected: `pxr`
only exists inside an Isaac Sim Python environment (Stage 7).

## Stage 5: Register on NVIDIA Brev and Launch Isaac Sim

NVIDIA Brev provisions a cloud GPU instance and can run Isaac Sim without a local
GPU. The recommended beginner path is the maintained Isaac Sim Launchable, which
gives you a preconfigured VSCode instance, a streaming client, Isaac Sim, and
Isaac Lab.

1. Go to [NVIDIA Brev](https://developer.nvidia.com/brev) and click
   `Get Started` to sign in or register with your NVIDIA account.
2. Deploy the Isaac Sim environment. Two options:
   - Recommended: use the Isaac Sim Launchable from
     [isaac-sim/isaac-launchable](https://github.com/isaac-sim/isaac-launchable),
     which deploys a preconfigured Isaac Sim and Isaac Lab instance.
   - Manual: click `Create New Instance`, select a GPU (NVIDIA documents
     `1x NVIDIA L40S` for this workflow), name the instance, and click `Deploy`.
3. When prompted, expose ports `49100`, `47998`, and `8210` to your IP only.
   These carry the WebRTC live stream. Do not open them to the public internet.
4. Wait for the instance to reach the ready state, then click `Open Notebook`
   and open a `Terminal` for command-line access.

If you used the manual instance instead of the Launchable, follow NVIDIA's
current [Isaac Sim on Brev deployment guide](https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_advanced_cloud_setup_brev.html)
to start the Isaac Sim container. At the time of writing that guide uses:

```bash
PUBLIC_IP=$(curl -s ifconfig.me)
mkdir -p ~/docker/isaac-sim/{cache/main,cache/computecache,config,data,logs,pkg}
sudo chown -R 1234:1234 ~/docker
ISAACSIM_HOST=$PUBLIC_IP ISAAC_SIM_IMAGE=nvcr.io/nvidia/isaac-sim:6.0.0 \
    docker compose -p isim -f tools/docker/docker-compose.yml up --build -d
```

Follow the official guide for the current image tag and exact commands, since
NVIDIA updates them between releases.

## Stage 6: Upload the Script and Assets

Get the generated script and the asset directory onto the instance. From the
Launchable's VSCode terminal or notebook terminal, the simplest route is to clone
this repository (which brings the asset directory) and then add your downloaded
script:

```bash
git clone <your-fork-or-repo-url> SpatialDSLStudio
# then upload generate_warehouse_usd.py into the working directory,
# for example by drag-and-drop into the VSCode file explorer.
```

You need two paths on the instance:

- the generated script, for example `~/generate_warehouse_usd.py`
- the asset root `~/SpatialDSLStudio/examples/omniverse-assets`

The asset root is where the script looks for `asset-manifest.json` and the
referenced USD files. Keep the `omniverse-assets` directory structure intact,
because its layers use relative references.

## Stage 7: Run the Script and View the Scene

The generated script builds a USD stage. Run it with Isaac Sim's standalone
Python launcher (`python.sh`), which sets up the `pxr` environment. Reference:
[Isaac Sim standalone Python](https://docs.isaacsim.omniverse.nvidia.com/latest/python_scripting/manual_standalone_python.html).

In the Isaac Sim container the install lives at `/isaac-sim`, so from the
instance terminal:

```bash
/isaac-sim/python.sh ~/generate_warehouse_usd.py \
  ~/warehouse_scene.usda \
  ~/SpatialDSLStudio/examples/omniverse-assets
```

The three arguments are the script, the output `.usda` path, and the asset root.
The asset root is optional: without it, the script looks for an
`omniverse-assets` directory beside the script and uses cube fallbacks when a
mapped asset is unavailable.

Expected terminal output:

```text
Generated USD scene: /root/warehouse_scene.usda
Elements: 28
Referenced assets: 28
```

The element count excludes the root `WarehouseSystem` object, because the
template only emits physical warehouse assets.

To view the result, open the streamed Isaac Sim session (the Launchable's
streaming client, or `http://<PUBLIC_IP>:8210` in a Chromium browser for the
manual container), then use `File > Open` and select `warehouse_scene.usda`.
Frame the viewport on `/World` to bring the millimeter-scale layout into view.
Inspect `/World/PathwayArea`, `/World/Conveyor`, `/World/OutputLocation`,
`/World/ChargingStation`, `/World/MobileRobot`, `/World/StorageRack`, and
`/World/Dock`.

Stage 7 gives a static snapshot. Stage 8 makes the robots move.

## Stage 8: Run the Live Navigation Simulation

The live simulation follows the same architecture as the Visual Components MAS:
the robot "brain" runs as a **separate process** and talks to the simulator over
**OPC UA**, exactly as the Visual Components WarehouseMAS does. Nothing about
path planning lives inside the simulator.

- Brain (`warehouse_brain.py`): hosts the OPC UA server, plans A* paths, avoids
  collisions between robots, and coordinates pickup/drop-off tasks.
- Simulator bridge (`run_warehouse_sim.py`): builds the scene with physics and,
  each frame, writes each robot's `Location` and reads its `Target` from the
  brain. No planning logic.
- Both read the same `warehouse_layout.json` you generated in Stage 4.

All three files live in `examples/omniverse-assets/warehouse_sim/`. See its
`README.md` for the full OPC UA node contract.

1. Install the OPC UA library on both sides (once):
   ```bash
   /isaac-sim/python.sh -m pip install asyncua   # simulator side
   pip install asyncua                            # brain side
   ```
2. Put `warehouse_layout.json` in `warehouse_sim/` (or use the sample already
   there).
3. Start the brain in one terminal:
   ```bash
   cd <repo>/examples/omniverse-assets/warehouse_sim
   python3 warehouse_brain.py --layout warehouse_layout.json
   ```
4. Start the simulator in a second terminal (inside Isaac Sim):
   ```bash
   /isaac-sim/python.sh run_warehouse_sim.py \
       --layout warehouse_layout.json \
       --asset-root <repo>/examples/omniverse-assets \
       --endpoint opc.tcp://127.0.0.1:4840/warehouse/mas
   ```
   Add `--headless --max-seconds 60` for a headless run.

In the streamed viewport the forklifts drive between the conveyors and the output
location, route around the racks and dock, and yield to each other where paths
cross. The brain reassigns each robot's goal as it arrives, tracks whether each
robot is carrying a product (`HasProduct`), and drains each robot's
`BatteryLevel` as it moves, diverting it to a charging station when it drops
below the model's low-battery threshold. All of this is exposed on the OPC UA
nodes (`Robot{n}/Location`, `/Target`, `/State`, `/HasProduct`, `/BatteryLevel`),
so any OPC UA client (a dashboard, or the Visual Components MAS) can read it.

You can validate the planner and the brain without a GPU or OPC UA:

```bash
cd <repo>/examples/omniverse-assets/warehouse_sim
python3 -m unittest test_nav test_brain
```

When you finish, stop or delete the Brev instance so it stops incurring GPU
charges.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ModuleNotFoundError: No module named 'pxr'` | Ran with system Python | Run with Isaac Sim's `python.sh` |
| `[asset] WARNING: no asset for ... using cube fallback` | Class has no manifest mapping | Every physical class is mapped by default; add a manifest entry for any custom class you introduce |
| `Asset not found; using placeholder` | Asset root path is wrong | Pass `examples/omniverse-assets` as the third argument and keep its structure intact |
| Scene opens far from the camera | Millimeter-to-meter scaling | Frame all geometry, or select `/World` and frame the selection |
| Simulator cannot connect to the brain | Brain not started, or wrong endpoint | Start `warehouse_brain.py` first; match `--endpoint` on both sides; check the port is reachable |
| `ModuleNotFoundError: No module named 'asyncua'` | OPC UA library missing | `pip install asyncua` (and `/isaac-sim/python.sh -m pip install asyncua` on the simulator side) |
| Generated element count below model count | Template skips `WarehouseSystem` | Expected for the current scene template |

For deeper coverage of the asset manifest, fallback behavior, and template
extension points, see [Omniverse Code Generation](omniverse-code-generation.md).

## References

- NVIDIA Brev: https://developer.nvidia.com/brev
- Isaac Sim on Brev deployment: https://docs.isaacsim.omniverse.nvidia.com/latest/installation/install_advanced_cloud_setup_brev.html
- Isaac Sim Launchable repo: https://github.com/isaac-sim/isaac-launchable
- Isaac Sim standalone Python: https://docs.isaacsim.omniverse.nvidia.com/latest/python_scripting/manual_standalone_python.html
- OpenUSD `UsdStage::CreateNew`: https://openusd.org/release/api/class_usd_stage.html

## Related Docs

- [Metamodels](metamodels.md)
- [Models](models.md)
- [Views (2D and 3D)](diagrams.md)
- [Code Generation](code-generation.md)
- [Omniverse Code Generation](omniverse-code-generation.md)
