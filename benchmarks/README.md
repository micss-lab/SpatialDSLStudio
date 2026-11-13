# Evaluation scripts

Three unattended scripts measure SpatialDSL Studio without a browser, an HTTP
server, or a database. All call the backend engines in-process and write their
results to `benchmarks/results/` (git-ignored).

## Prerequisites

```bash
cd backend && npm ci                       # the scripts reuse the backend's ts-node and engines
cd ../benchmarks
python3 -m venv .venv && .venv/bin/pip install usd-core   # fidelity and twin loop; provides pxr
```

## Scalability

```bash
cd benchmarks && npm run scalability
```

Generates seeded synthetic Smart Warehouse models with 100, 500, 1,000, 2,500,
5,000, and 10,000 placed elements on a grid with random yaw, about 5 percent of
them placed to violate one of the example spatial rules. For each size it
reports the median of 5 runs (after one warm-up run) of spatial rule
evaluation, the full backend model validation engine, and code generation of
the Smart Warehouse OpenUSD project, plus the serialized model size. The script
fails if the number of rule issues differs from the number of seeded
violations.

Outputs: `results/scalability.csv`, `results/scalability.md`,
`results/scalability.json` (including CPU, RAM, OS, and Node.js version).
Expected runtime: about 20 seconds on an Apple M2.

## Generation fidelity

```bash
cd benchmarks && npm run fidelity          # same as: .venv/bin/python fidelity.py [K] [seed]
```

Applies K = 200 seeded pose edits (move, rotate, elevate) to the bundled Smart
Warehouse model and regenerates after each edit. Every generated layered USD
stage is opened with pxr; each element's `xformOp:translate`, composed world
translation, `xformOp:rotateZ`, `xformOp:scale`, and `spatialDsl:*` attributes
are compared with the model after the millimetre-to-metre conversion
(tolerance 1e-6). The Visual Components location files and the Omniverse
`warehouse_layout.json` are compared the same way; the layout JSON gives a yaw
only for drones (the other groups are axis-aligned footprints for the
simulator), so their yaw is compared in USD and Visual Components only. The
first and last composed stages are checked with the `UsdValidation` framework,
and the unedited model is generated twice to confirm byte-identical outputs.
The script exits non-zero on any mismatch, nondeterminism, or USD validation
error or warning.

Outputs: `results/fidelity.json`, `results/fidelity.md`, and the generated
bundles in `results/fidelity/`. Expected runtime: under 10 seconds.

## Twin loop

```bash
cd benchmarks && npm run twin-loop
```

Generation fidelity compares the model with the generated files. The twin loop
continues from there: it compares the model with what the scene does when it
runs, and brings the result back in the model's own terms.

1. The bundled Smart Warehouse model is generated into
   `results/twin-loop/bundle/`. Every generated prim and layout record carries
   the ID of its model element (`spatialDsl:elementId`, `id`).
2. `observe.py snapshot` reads the composed stage with pxr and records the
   authored pose of every stamped prim, with the layer that authors it.
3. A simulator runs the bundle and records an observation log: the world pose
   of every stamped prim over time, plus which elements the simulator drives.
4. Each sample is lifted onto a copy of the model: the observed model pose is
   the design pose plus the difference between the observed and the authored
   scene pose. The design-time spatial rules are then evaluated, unchanged, on
   the lifted model.

The report lists, per run:

- **realization offsets**: undriven elements that never sat at their authored
  pose;
- **runtime drifts**: undriven elements that moved during the run, with the
  onset time;
- **rule verdicts that differ** between the model and the run, with the time
  span in which they held;
- a **reconciliation proposal**: the model changes that accepting the observed
  state would make (`reconciled-model.json`, importable as a model), and the
  rule issues that model would gain or lose.

Each finding names the model element, the prim, the generated file, and the
template that produced that file.

Without arguments the script runs three scenarios on the simulator stand-in
(`run_standin_sim.py`: the MAS brain drives the robots kinematically, with no
physics engine): an undisturbed run, a storage rack pushed into the aisle at
t = 20 s, and a dock resting 150 mm above its authored pose. It exits non-zero
if the findings differ from what was injected. The stand-in checks the loop,
not the physics: deviations exist only where a scenario injects them.

To analyse a run recorded in Isaac Sim, run the bundle from
`results/twin-loop/bundle/` with the brain and the bridge (see
`examples/omniverse-assets/warehouse_sim/README.md`) and pass the log back:

```bash
python3 warehouse_brain.py --layout <bundle>/warehouse_layout.json            # terminal 1
/isaac-sim/python.sh run_warehouse_sim.py --layout <bundle>/warehouse_layout.json \
    --scene <bundle>/warehouse_simulation.usda \
    --observe-out observations.jsonl --headless --max-seconds 60              # terminal 2
npm run twin-loop -- --observations observations.jsonl
```

The log records the hash of the layout it ran against; the script refuses a log
recorded against a different generation of the model.

Outputs: `results/twin-loop.json`, `results/twin-loop.md`, and per-scenario
`report.json`, `report.md`, `observations.jsonl`, and `reconciled-model.json`
in `results/twin-loop/`. Expected runtime: about 5 seconds.
