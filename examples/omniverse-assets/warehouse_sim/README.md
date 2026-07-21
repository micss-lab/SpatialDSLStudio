# Warehouse Simulation (Isaac Sim + external MAS brain)

A decoupled, MAS-style warehouse navigation demo, mirroring the Visual Components
architecture where the WarehouseMAS runs as a separate process and talks to the
simulator over OPC UA.

- **Simulator** (`run_warehouse_sim.py`, runs inside Isaac Sim): builds the USD
  scene with physics and moves the robots. Contains **no planning logic**. Each
  frame it writes each robot's `Location` and reads its `Target` over OPC UA.
- **Brain** (`warehouse_brain.py`, standalone process): the multi-agent
  controller. Hosts the OPC UA server, reads `Location`, plans with `nav.py`
  (A* global paths + local reciprocal collision avoidance), coordinates tasks
  (ferrying between pickups and drop-offs), and writes `Target`.
- **Planner** (`nav.py`): engine-independent A* + dynamic-window avoidance.
- **Layout** (`warehouse_layout.json`): the model data, produced by the
  "Generate Warehouse Layout" code generation template from a Smart Warehouse
  model. Both processes read the same file.

## OPC UA node contract

Namespace `urn:warehouse:mas`. Robots are `Robot1..RobotN` (the WarehouseMAS
1-indexed scheme). Node string identifiers:

| Node | Type | Writer | Meaning |
| --- | --- | --- | --- |
| `Robot{n}/Location` | Double[3] | simulator | `[x, y, headingDeg]`, metres |
| `Robot{n}/Target` | Double[3] | brain | `[x, y, speed]`, the next point to drive toward |
| `Robot{n}/State` | String | brain | `to_pickup` / `to_dropoff` / `to_charge` / `charging` |
| `Robot{n}/HasProduct` | Boolean | brain | true while carrying a product to the drop-off |
| `Robot{n}/BatteryLevel` | Double | brain | battery percent; drains while moving |

This is the same state-out / command-in split the Visual Components connectivity
config uses (SimulationToServer / ServerToSimulation variable groups), and the
same `Robot{n}/Location`, `/Target`, `/HasProduct`, `/BatteryLevel` node names.

The brain drains `BatteryLevel` as a robot moves and, when it drops below the
robot's `lowBattery` threshold (from the model), routes the robot to the nearest
charging station and recharges at its `chargeRate` before resuming tasks.

## Run it

Requires `asyncua` on both sides (`pip install asyncua`). Isaac Sim's bundled
Python can install it with `./python.sh -m pip install asyncua`.

1. Generate the layout from your model (Code Generation, "Generate Warehouse
   Layout" template) and place `warehouse_layout.json` here, or use the sample
   already in this folder.
2. Start the brain (any Python 3):
   ```bash
   python3 warehouse_brain.py --layout warehouse_layout.json
   ```
3. Start the simulator inside Isaac Sim:
   ```bash
   /isaac-sim/python.sh run_warehouse_sim.py \
       --layout warehouse_layout.json \
       --asset-root <repo>/examples/omniverse-assets \
       --endpoint opc.tcp://127.0.0.1:4840/warehouse/mas
   ```
   Add `--headless --max-seconds 60` for a headless run.

The robots plan paths around the racks and dock and yield to each other at
crossings; the brain reassigns pickup/drop-off goals as they arrive.

## Tests

Pure-Python, no Isaac Sim or OPC UA needed:

```bash
python3 -m unittest test_nav test_brain
```

- `test_nav.py`: A* routes around obstacles / returns None when walled off;
  robots (head-on and a 4-way crossing) avoid each other and still reach goals.
- `test_brain.py`: the brain's state-out / command-in control loop makes robots
  ferry tasks and keep clearance, exercising the exact contract OPC UA carries.

## Swapping the transport

`nav.py` and the `WarehouseMAS` class have no transport dependency. To use ROS 2
or a raw socket instead of OPC UA, replace the `serve()` function in
`warehouse_brain.py` and the OPC UA client block in `run_warehouse_sim.py`; the
`Location` / `Target` contract stays the same.
