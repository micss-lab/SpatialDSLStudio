# Warehouse Kit Assets

Simple placeholder USD props authored for the Smart Warehouse example. Each asset
is built from UsdGeomCube primitives and shaded with displayColor only (no
external textures or materials).

- Author: SpatialDSL Studio project (original work).
- License: CC0 1.0 (public domain dedication). Free to use, modify, and redistribute.
- Units: metres, Z-up. Each asset is normalised to a 1 x 1 x 1 m box centred on
  XY with its base at z = -0.5, so the generated scene script's "fit" scale mode
  sizes each instance to its modelled dimensions and drops it onto the floor.
- `inspection_drone.usda` is a project-authored 1.2 x 1.2 x 0.4 m visual asset
  whose prim origin is centred in XY at base Z=0. It is referenced without fit
  scaling so its modeled base elevation maps directly to the asset origin.

These are review-quality placeholders, not production warehouse assets. Replace
them with reviewed geometry by editing asset-manifest.json.
