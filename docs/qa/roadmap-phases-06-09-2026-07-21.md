# Roadmap Phases 6–9 Verification Record

- Date: 2026-07-21
- Host: Darwin arm64
- Scope: final integrated repository verification after implementing Phases 6–9

## Toolchain

| Tool | Version |
| --- | --- |
| Node.js | 24.14.0 |
| npm | 11.9.0 |
| Python | 3.13.11 |
| Apple USD Tools | 0.25.2 |
| Java compiler | 21.0.10 |

## Automated results

| Area | Result |
| --- | --- |
| Frontend Jest suite | PASS — 45 suites, 291 tests |
| Backend Jest suite | PASS — 29 suites, 586 tests |
| Frontend production build | PASS |
| Backend TypeScript build | PASS |
| Sirius bundle ZIP and cross-reference tests | PASS |
| F1TENTH visual/collision/articulation `usdchecker` | PASS |
| Recursive asset-manifest validator | PASS — 13 files, 0 warnings, 0 errors |
| Asset-manifest Python tests | PASS — 4 tests |
| Warehouse navigation, brain, and runtime-mode tests | PASS — 15 tests |
| Generated USD layout/assets/physics/simulation validation | PASS |
| Generated Python syntax compilation | PASS |
| Smart Warehouse codegen project tests | PASS — 7 tests |
| Generated Visual Components Java compilation | PASS with `javac` 21 |
| JSON parsing and `git diff --check` | PASS |

The USD tools emitted a local duplicate plugin-registration diagnostic before
some commands, but returned success and reported no asset validation errors.

## Recorded SHA-256 checksums

```text
c1631a0172bfc8f36e22f01fb549467a11c0c547a5d101a7bc76f7ec46c76fd2  f1tenth_amr.usda
1c578310589f40033e06ca3c22042bd0578a97281cf680097a124a59979cdd7b  f1tenth_amr_articulation.usda
2d17ae956cd1483fa76dbc5be27b9f47935915e2a6da889c99cd1156cf9cf88e  f1tenth_amr_collision.usda
da190aa72b4198df486a5ae76d6cbcc846e6f4dbb60ffea8ef1f77de57d8524f  layers/articulation.usda
fb86843c47d6af9fd94a7fe379da0e19cf384d7306c6becaeef0a341aae1902b  layers/collision.usda
c600c9b07986efaa9ae359a6e6cfae76c34b9d4994009ef6a19f7485ef95184d  layers/materials.usda
3d804d20af349b7fcb46025b186f54e14887c547adbd16599f2eac5051b8e491  layers/visual.usda
9583b3f734c2b269ff6471efd9ae24b4895b93f892be1e7bb120a3ecd598fc7f  smart-warehouse-omniverse-project.json
44c8db5c380b36b43a728e6032ed5e25aa48b78b78f02f796ff730cef6d60cf8  smart-warehouse-visual-components-project.json
```

## External release gates

These checks need vendor software or hardware that was not present on the test
host. They remain deliberately unchecked in the phase plans:

- import and open the Phase 6 bundle in Eclipse Sirius Desktop;
- render and play the Phase 7/8 scene in NVIDIA Isaac Sim on supported RTX
  hardware, recording runtime version and screenshots;
- load the Phase 9 output in Visual Components and test the OPC UA contract
  against a live WarehouseMAS server.

The absence of those runtimes is not recorded as a pass. It does not change the
completed status of the implementation and repository-verifiable checks.
