# NVIDIA F1TENTH Ackermann AMR asset

## Provenance

- Upstream: [NVIDIA Omniverse sample-ackermann-amr](https://github.com/NVIDIA-Omniverse/sample-ackermann-amr)
- Upstream revision: `ccf6b3ee65a3df82160b217a4cd1b523b2f7c351`
- Upstream asset: `assets/F1Tenth.usd` and its composed CAD/rigging layers
- Upstream author: NVIDIA Corporation & Affiliates
- Upstream license: MIT; see [`LICENSE`](LICENSE)
- Retrieved and reviewed: 2026-07-21
- Redistribution: permitted with the MIT notice retained

The upstream sample is a binary-USDC composition with a multi-megabyte CAD
payload. To keep this repository cloneable without Git LFS while retaining a
stable, inspectable AMR, this directory contains a lightweight OpenUSD
re-authoring of the F1TENTH platform. It preserves the recognizable two-deck
chassis, four wheels, suspension envelope, sensor mast, lidar, camera, and
Ackermann wheel layout using standard USD primitives. No opaque upstream mesh
payload is copied. The NVIDIA design/source attribution and MIT notice are
retained because the local asset was produced from that licensed reference.

## Normalization contract

- Root/default prim: `/F1TenthAMR`
- Units: metres (`metersPerUnit = 1`)
- Up axis: `Z`
- Forward axis: `+X`
- Ground contact plane: `Z = 0`
- Nominal visual bounds: `0.58 m` long, `0.34 m` wide, `0.31 m` high
- Asset version: `1.0.0-spatialdsl`

Files are deliberately layered:

- `f1tenth_amr.usda`: visual/material composition root
- `f1tenth_amr_collision.usda`: visual root plus reviewed proxy colliders
- `f1tenth_amr_articulation.usda`: optional differential-drive physics proxy
- `layers/visual.usda`: render geometry only
- `layers/materials.usda`: `UsdPreviewSurface` materials
- `layers/collision.usda`: physics collision proxies only
- `layers/articulation.usda`: rigid bodies, wheel joints, and angular drives

The collision root is the manifest entry used by SpatialDSL. Phase 8 may add
rigid-body or articulation opinions in stronger layers without modifying the
licensed visual layer.

## Reproducible QA

From this directory:

```bash
usdchecker f1tenth_amr.usda
usdchecker f1tenth_amr_collision.usda
usdcat -l f1tenth_amr_collision.usda
```

See [`QA.md`](QA.md) for the recorded compatibility and manual-render matrix.
