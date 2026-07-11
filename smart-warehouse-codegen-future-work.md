# Smart Warehouse Codegen Future Work

## Purpose

Track the work required to move the Smart Warehouse Visual Components and
Omniverse generators from reviewable examples to production-ready integrations.

This is a roadmap, not a commitment to put platform-specific behavior into the
core code generator. Target-specific behavior should remain in importable
projects unless several targets need the same generic capability.

## Current Baseline

Implemented:

- code generation project import in PR #14
- Smart Warehouse Visual Components and Omniverse projects in PR #16
- eight Visual Components outputs, including OPC UA configuration
- OpenUSD scene generation for 25 physical warehouse elements
- model-driven OPC UA port and namespace values
- automated Handlebars rendering, JSON parsing, and XML parsing tests
- a vendored CC0 USD vehicle subset for asset-reference testing
- a `MobileRobot` asset reference with placeholder fallback

The included CC0 vehicle is a composition demonstrator, not a production AMR.

## Release Gates

- [ ] Merge PR #14.
- [ ] Retarget PR #16 to `main` after PR #14 merges.
- [ ] Run the normal CI workflow on PR #16.
- [ ] Import and generate all eight files in the deployed application.
- [ ] Load the generated setup script and connectivity XML in Visual Components.
- [ ] Confirm the OPC UA application URI advertised by the real server.
- [ ] Run the generated OpenUSD script in Isaac Sim.
- [ ] Confirm referenced assets resolve when `--asset-root` is supplied.
- [ ] Confirm missing assets produce visible cube fallbacks rather than an invalid stage.

## Real USD Asset Support

### Implemented Demonstrator

The initial asset library is under:

```text
examples/omniverse-assets/cc0-mini-vehicle-kit/
```

The generated script maps `MobileRobot` to:

```text
cc0-mini-vehicle-kit/demo_forklift.usda
```

The script accepts an asset root as its second command-line argument. Assets are
added through USD references, so geometry and materials remain external and can
be reused by every robot instance. If the mapped file is unavailable, generation
continues with the existing cube representation.

### Production Asset Onboarding

Every production asset should pass this sequence:

1. Record source, author, license, version, and redistribution terms.
2. Reject assets that cannot legally be redistributed with the repository.
3. Ensure the root layer has a valid `defaultPrim`.
4. Normalize or explicitly record `metersPerUnit` and `upAxis`.
5. Preserve all referenced layers, textures, and materials with relative paths.
6. Add class mapping, orientation, scale, and vertical offset metadata.
7. Validate the root asset with `usdchecker` and `usdcat -l`.
8. Inspect it in Isaac Sim with materials enabled.
9. Add collision and physics schemas in a separate simulation layer.
10. Add a regression test for missing and resolved asset paths.

### Asset Manifest

Move the hard-coded demonstration mapping into a versioned manifest:

```json
{
  "MobileRobot": {
    "asset": "robots/amr/model.usd",
    "uniformScale": 1.0,
    "rotateXDeg": 0,
    "zOffsetM": 0.0
  }
}
```

The manifest should support project defaults plus per-element overrides. It
should not expose arbitrary filesystem access in browser code.

## Prioritized Backlog

### P0: Release Completion

- [ ] Complete the release gates above.
- [ ] Record tested Visual Components and Isaac Sim versions.
- [ ] Add a QA report with screenshots and generated-file checksums.

### P1: Asset Pipeline Hardening

- [ ] Add a versioned asset manifest and schema validation.
- [ ] Package referenced assets with generated downloads or produce a deployment manifest.
- [ ] Add per-class and per-element asset selection.
- [ ] Calculate scale from source bounds and modeled dimensions.
- [ ] Normalize Y-up assets into the Z-up generated stage.
- [ ] Add missing-asset diagnostics to the generated script and UI.
- [ ] Decide whether production assets live in Git LFS, object storage, or Nucleus.

### P2: Omniverse Simulation Fidelity

- [ ] Replace remaining class cubes with reviewed warehouse assets.
- [ ] Add collision approximations and rigid-body schemas.
- [ ] Add robot articulation or a supported Isaac Sim robot reference.
- [ ] Generate navigation, motion, and event logic separately from scene layout.
- [ ] Split output into layout, asset, physics, and simulation layers.
- [ ] Add instanceable references for repeated static assets.

### P3: Visual Components Hardening

- [ ] Make OPC UA application URI a model attribute or generation parameter.
- [ ] Detect supported Visual Components installation and library paths.
- [ ] Verify Python API compatibility for each supported Visual Components version.
- [ ] Test generated OPC UA node IDs against the live WarehouseMAS server.
- [ ] Replace `java` language tags on JSON/XML templates when generic content types exist.

### P4: Core Codegen Improvements

- [ ] Add native `json`, `xml`, and plain-text template content types.
- [ ] Make generated ordering deterministic without changing semantic model order.
- [ ] Add project-level static assets or binary attachment support.
- [ ] Add end-to-end import, generate, and ZIP-download coverage.

### P5: Spatial Semantics

- [ ] Define an explicit transform between diagram coordinates and physical coordinates.
- [ ] Store scale, origin, axis direction, and units as model/view metadata.
- [ ] Expose canonical spatial presentation fields to JS and OCL constraints.
- [ ] Add bounds, overlap, and clearance helpers after coordinate semantics are stable.
- [ ] Keep 2D layout edits independent from 3D placement unless synchronization is enabled.

Do not ship an implicit `1 pixel = 1 millimetre` conversion. The current Smart
Warehouse fixture uses independent diagram and physical coordinate systems.

## Suggested PR Sequence

1. Asset manifest and generated-script parameterization.
2. Asset packaging and missing-asset diagnostics.
3. One production-grade AMR asset with collision and Isaac Sim QA.
4. Static assets for conveyors, stations, and output locations.
5. Layered USD output and physics.
6. Spatial coordinate contract and constraint context in a separate core PR.

## Definition Of Done

The asset-based Omniverse path is production-ready when:

- every generated physical class resolves to an approved asset or documented fallback
- the generated stage opens without missing references or validation errors
- units, orientation, dimensions, and placement match the source model
- repeated assets use references or instances rather than copied geometry
- licensing and provenance are recorded for every distributed asset
- CI validates templates and USD layers
- Visual Components and Isaac Sim QA results are attached to the release
