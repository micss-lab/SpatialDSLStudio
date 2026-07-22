# Phase 7: Production AMR Asset and Isaac Sim QA

- Track: Spatial
- Status: Completed July 21, 2026 (external Isaac Sim QA pending)
- Master roadmap: [ROADMAP.md](../ROADMAP.md) (spatial track, item 7)
- Tracker: [smart-warehouse-codegen-future-work.md](../smart-warehouse-codegen-future-work.md) (P1/P2)
- Reference: [docs/user-guide/end-to-end-omniverse.md](../docs/user-guide/end-to-end-omniverse.md)

## Goal

Replace one placeholder prop with a production-grade, licensed AMR USD asset and
verify it in Isaac Sim, establishing the asset-onboarding pipeline.

## Why

The `warehouse-kit` props and the CC0 forklift are review-quality placeholders. A
believable digital twin needs at least one real, correctly-scaled, provenance-
tracked robot asset, plus a repeatable QA process. This proves the asset pipeline
end to end before scaling to more assets.

## Scope

In:
- Source one licensed/CC0 AMR USD asset; record source, author, license, version,
  redistribution terms.
- Onboard it per the future-work checklist: `defaultPrim`, `metersPerUnit`/`upAxis`,
  relative references, class/orientation/scale metadata, `usdchecker`/`usdcat`.
- Add it to `asset-manifest.json` (MobileRobot override or default) with collision.
- Isaac Sim visual QA with materials; record versions and screenshots.

Out (later):
- Full asset library for every class; Nucleus/object-store hosting decision.

## Tasks

- [x] Acquire and license-check one AMR USD asset; write its `SOURCE.md`.
- [x] Normalize units/orientation; validate with `usdchecker` and `usdcat -l`.
- [x] Add collision/physics schema in a separate layer.
- [x] Wire it into the asset manifest and regenerate the scene.
- [ ] Isaac Sim QA: open with materials, verify placement/scale; capture a QA report.
- [x] Regression test for resolved vs missing asset paths.

## Verification

- [x] `usdchecker` passes for visual, collision, and articulation roots.
- [x] Recursive manifest validation resolves all asset dependencies inside the
  portable asset root, with missing/traversal regression coverage.
- [ ] Manual Isaac Sim run shows the real robot correctly placed and scaled.

Automated evidence and checksums are recorded in
[`docs/qa/roadmap-phases-06-09-2026-07-21.md`](../docs/qa/roadmap-phases-06-09-2026-07-21.md).

## Follow-ups

- Decide asset hosting (Git LFS vs object storage vs Nucleus) before scaling.
