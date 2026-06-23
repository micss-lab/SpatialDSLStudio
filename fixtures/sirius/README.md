# Sirius Fixtures

These fixtures are small, synthetic Sirius-style projects for compatibility
work. They are not full Eclipse workspace exports.

## Layout

```text
fixtures/sirius/
  minimal-diagram/
    description/minimal.odesign
    model/minimal.ecore
    model/sample.xmi
    representations.aird
    expected-report.json
  unsupported-features/
    description/unsupported.odesign
    model/unsupported.ecore
    model/sample.xmi
    representations.aird
    expected-report.json
  aird-layout/
    description/minimal.odesign
    model/minimal.ecore
    model/sample.xmi
    representations.aird
    expected-report.json
```

Use `minimal-diagram` for the first supported import/export path. Use
`unsupported-features` to verify that unsupported constructs are reported
explicitly rather than dropped silently.

Use `aird-layout` for the `.aird` view import path: its `representations.aird`
carries a `DSemanticDiagram` plus GMF `notation:Diagram` layout (node `Bounds`
and edge waypoints). `.aird` import resolves diagram elements against an
already-imported model and viewpoint, so import the `.ecore`/`.xmi` and
`.odesign` first, then the `.aird`.
