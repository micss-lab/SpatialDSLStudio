# Evaluation scripts

Two unattended scripts measure SpatialDSL Studio without a browser, an HTTP
server, or a database. Both call the backend engines in-process and write their
results to `benchmarks/results/` (git-ignored).

## Prerequisites

```bash
cd backend && npm ci                       # the scripts reuse the backend's ts-node and engines
cd ../benchmarks
python3 -m venv .venv && .venv/bin/pip install usd-core   # fidelity only; provides pxr
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
