# Ecore / XMI Interop with Eclipse EMF

> Local working notes. Not for commit.

## Why

Eclipse EMF is the de-facto MDE toolset. Users who already have a metamodel
in `.ecore` and instance models in `.xmi` should be able to bring their work
into SpatialDSLStudio (and round-trip back out). This is the main on-ramp
for users coming from EMF-based tools (Sirius, Papyrus, Capella, Henshin).

## Current state

`frontend/src/services/metamodel/ecore.service.ts` (560 lines) already does
**part** of the metamodel side. Wired into `MetamodelManager.tsx:147`.
Nothing exists for instance models.

| Capability | Status |
|---|---|
| Metamodel → `.ecore` (export) | ✅ basic, ⚠️ buggy |
| `.ecore` → Metamodel (import) | ✅ basic, ⚠️ buggy |
| Metamodel → `.xmi` (export) | ❌ misleading — emits custom `mm:` namespace, not real Ecore XMI; Eclipse cannot read it |
| Metamodel → PlantUML | ✅ works (bonus) |
| Model → `.xmi` (export) | ❌ missing entirely |
| `.xmi` → Model (import) | ❌ missing entirely |

### Bugs / gaps in the existing metamodel side

**Export (`metamodelToEcore`):**
- `ecore.service.ts:67-70` skips any attribute named `name` ("already handled
  by Ecore"). Wrong — Ecore's `EClassifier.name` is the *class* name, not an
  attribute. User-defined `name` attributes get silently dropped.
- `defaultValue` is never emitted (`defaultValueLiteral` in Ecore).
- `MetaReference.opposite` (bidirectional refs / `eOpposite`) not emitted.
- No support for enumerations (`EEnum` / `EEnumLiteral`).
- Reference attributes (`MetaReference.attributes`) have no direct Ecore
  equivalent — need to be lost or mapped to an EClass.
- Constraints not emitted as `<eAnnotations source="...OCL">` (Eclipse's
  convention for OCL bodies).
- Cross-package references not supported (single `EPackage` per file
  assumed).

**Import (`importFromEcore`):**
- Cross-references use *name-based* lookup
  (`ecore.service.ts:184-198, 252-253`). Breaks if names collide and silently
  drops cross-package refs.
- Mixes EClass + EEnum in the same selector but never reads literals —
  EEnums become empty EClasses.
- `eSuperTypes` only handled as child `<eSuperTypes href="#//X"/>` — Eclipse
  often emits the inline XMI form `eSuperTypes="#//X #//Y"` (attribute,
  space-separated). Inheritance is lost for those files.
- `defaultValueLiteral` not read.
- `eOpposite`, `eAnnotations`, `eOperations`, custom `EDataType` not handled.

**Misleading "XMI" export:**
- `metamodelToXmi` emits a tool-private format under `mm:Package` — looks
  like XMI but isn't Ecore-conformant. Round-trip works inside the app, but
  the menu item is misleading. Should be removed in favor of *real* Ecore
  XMI (same as `.ecore` — Ecore files *are* XMI).

## Eclipse interop reference

Real Ecore (metamodel) file shape — example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ecore:EPackage xmi:version="2.0"
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xmlns:ecore="http://www.eclipse.org/emf/2002/Ecore"
    name="library" nsURI="http://example.org/library" nsPrefix="lib">
  <eClassifiers xsi:type="ecore:EClass" name="Book">
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="title"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EString"/>
    <eStructuralFeatures xsi:type="ecore:EAttribute" name="pages"
        eType="ecore:EDataType http://www.eclipse.org/emf/2002/Ecore#//EInt"
        defaultValueLiteral="0"/>
    <eStructuralFeatures xsi:type="ecore:EReference" name="author"
        lowerBound="1" eType="#//Person" eOpposite="#//Person/books"/>
  </eClassifiers>
  <eClassifiers xsi:type="ecore:EEnum" name="Genre">
    <eLiterals name="FICTION"/>
    <eLiterals name="NONFICTION" value="1"/>
  </eClassifiers>
</ecore:EPackage>
```

Real `.xmi` (instance) file shape — example, conforms to the above:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<library:Library xmi:version="2.0"
    xmlns:xmi="http://www.omg.org/XMI"
    xmlns:library="http://example.org/library"
    name="MyLibrary">
  <books name="Hamlet" pages="200" author="//@persons.0"/>
  <books name="Tempest" pages="150" author="//@persons.0"/>
  <persons name="Shakespeare" books="//@books.0 //@books.1"/>
</library:Library>
```

Key XMI conventions for instances:
- **Containment edges become XML nesting** — `<books>` is a child because
  the `library:Library` class has a containment EReference named `books`.
- **Non-containment refs become attributes** with **EMF fragment paths**:
  `//@persons.0` means "root EObject, feature `persons`, index 0."
  Multi-valued refs are space-separated.
- **`xmi:id`** is optional but commonly emitted by Eclipse; used as anchor
  when a model spans multiple files (`<owner href="other.xmi#//@employees.0"/>`).
- The root element's tag is `<prefix:RootClass>` where `prefix` matches the
  metamodel's `nsPrefix`.

## Decisions (locked)

These shape every phase below. Implementations must follow them.

| Topic | Decision |
|---|---|
| **Enums** | First-class `MetaEnum` type. Add to `shared/types/index.ts`. Attribute editor shows a dropdown when type=enum. Round-trip is lossless. |
| **Reference attributes** (`MetaReference.attributes`) | Drop on export, show a warning dialog listing what was dropped. Do **not** synthesize association classes — metamodel shape stays stable. |
| **Multi-resource models** | Out of scope for v1. External `href` to other files becomes a broken ref → warn and drop. Single-file `.xmi` only. |
| **Layout on `.xmi` import** | Grid auto-layout: group by EClass, place in rows. Document that XMI carries no layout. |
| **OCL constraints** | Preserve round-trip via `<eAnnotations source="http://www.eclipse.org/emf/2002/Ecore/OCL">`. Implement in Phase 1, not deferred. |

## Proposal — phased

### Phase 1 — Fix the existing metamodel side (cleanup)

Lowest risk, biggest correctness win. Single file changes in
`ecore.service.ts`, plus `MetaEnum` type additions.

- Drop the "skip `name` attribute" rule.
- Emit `defaultValueLiteral` for attributes when `defaultValue` is set.
- Support `eSuperTypes` as both child element and inline XMI attribute on
  import.
- **Add `EEnum` / `eLiterals` support both directions.** New type:
  ```ts
  export interface MetaEnumLiteral { name: string; value?: number; }
  export interface MetaEnum extends MetamodelElement {
    literals: MetaEnumLiteral[];
  }
  export interface Metamodel {
    // ... existing
    enums?: MetaEnum[];     // new, optional for backward-compat
  }
  ```
  Extend `MetaAttribute.type` to accept enum ids:
  `type: 'string' | 'number' | 'boolean' | 'date' | { enumId: string }`.
  Attribute editor: when type is an enum, render `<Select>` of literals.
- **Preserve OCL constraints** via `<eAnnotations>`. On export, each
  constraint becomes an annotation child of the EClass with
  `source="http://www.eclipse.org/emf/2002/Ecore/OCL"` and the OCL body
  in `<details key="invariant" value="..."/>`. On import, parse them
  back into the metamodel's `constraints` array.
- Remove the misleading `metamodelToXmi`/`downloadAsXmi`/`mm:Package`
  output. Ecore *is* XMI — collapse the export menu to a single Ecore
  option. Drop the `xmi` UI option in `MetamodelManager.tsx`.
- Switch cross-reference resolution from name-based to a name→id map built
  from the in-document XMI fragment paths, so collisions don't silently
  break. Still works for the common single-package case.
- **Reference attributes warning** on export: collect names of refs that
  carry `attributes`, surface them in the result so the export dialog can
  show "Dropped 3 reference attributes: [Activity.flowsTo.guard, ...]".

Ship-ready after this phase; metamodels round-trip cleanly with Eclipse for
typical use, with documented lossy spots.

### Phase 2 — Model XMI export

New file `frontend/src/services/model/model-xmi-export.service.ts`.

Algorithm:
1. Resolve the model's metamodel via `model.conformsTo`.
2. Find the root element(s) — the model element(s) not contained by any
   other element through a containment reference. If multiple, emit one
   `<xmi:XMI>` wrapper with multiple root children (XMI allows it).
3. Walk the containment tree depth-first. At each element:
   - Tag = the EReference name from the parent (root tag = `<prefix:Class>`).
   - Emit own attributes as XML attributes (enum values use the literal
     name, not the numeric value, per EMF convention).
   - Emit non-containment refs as attributes with fragment paths.
   - Recurse into containment refs as nested children.
4. Build a `id → fragmentPath` map up-front so non-containment refs can be
   resolved.
5. `model.connections` translation:
   - The source/target relationship maps to an EReference assignment on the
     source element (set during the walk).
   - **Per-connection attributes are dropped** (decision: no association
     class). Collect them into a `droppedReferenceAttributes` warning list.
6. Return `{ xml: string, warnings: ExportWarning[] }`. The warning list
   includes:
   - Dropped reference attributes (per-connection guards, weights, etc.).
   - Dropped per-connection bend points (no Ecore equivalent).
   - Dropped `presentation` data (layout — no equivalent in core XMI).

UI: add an "Export → XMI" action in `ModelManager.tsx` alongside the JSON
export. Show the warnings list in a dialog after export with a "Download
anyway" / "Cancel" choice.

### Phase 3 — Model XMI import

New file `frontend/src/services/model/model-xmi-import.service.ts`.

Algorithm:
1. Parse XML with `DOMParser`.
2. Read root tag's namespace prefix → look up `Metamodel.uri` to find the
   matching metamodel in the workspace. If not found, prompt the user to
   import the `.ecore` first (link to the metamodel-import flow).
3. Walk the DOM:
   - For each element, look up the EClass by tag name (root) or by the
     parent's containment ref's `eType`.
   - For each XML attribute that isn't a reference → assign to `style[attr]`.
     If the EAttribute is an enum, validate the value is a known literal.
   - For each attribute that matches a non-containment ref → defer to a
     second pass.
4. Build fragment-path → new-element-id map in pass 1.
5. Pass 2: resolve all deferred refs using the map. **Cross-file `href`
   values are dropped with a warning** (multi-resource out of scope).
6. **Apply grid auto-layout**: group elements by their EClass id, then
   place each group in a row, elements left-to-right with fixed spacing.
   Set `presentation.position2D` accordingly. Set default sizes
   (`120×80` for nodes). Document the trade: "XMI carries no layout —
   positions were auto-generated."
7. Return `{ model: Model, warnings: ImportWarning[] }`. Warnings include
   broken cross-file refs, unknown EClass tags (skipped), and any
   attribute values that didn't match an enum literal.

UI: add "Import → XMI" alongside JSON import in `ModelManager.tsx`. Show
warnings after import.

### Phase 4 — Polish & samples

- Bundle a real EMF-generated `.ecore` + `.xmi` pair as a test fixture
  (Library example is canonical). Add unit tests for round-trip:
  `ecore → metamodel → ecore` and `xmi → model → xmi` should be
  diff-stable on the relevant attributes.
- Document the supported subset in `README.md`:
  - Round-tripped: classes, attributes, references, supertypes, enums,
    OCL constraints (as eAnnotations).
  - Dropped on export: reference attributes, per-connection bend points,
    `presentation` (layout/appearance), view membership.
  - Dropped on import: cross-file `href`s, unknown EClass tags.
- Surface clear warning dialogs (already covered in Phase 2/3).

## Files to touch (preview)

```
shared/types/index.ts                                   — add MetaEnum + enum-typed MetaAttribute
shared/types/index.d.ts                                 — regenerate
frontend/src/services/metamodel/ecore.service.ts        — Phase 1 fixes (enums, OCL, supertypes, name bug)
frontend/src/components/metamodel/MetamodelManager.tsx  — drop the misleading XMI menu, surface warnings
frontend/src/services/model/model-xmi-export.service.ts — new (Phase 2)
frontend/src/services/model/model-xmi-import.service.ts — new (Phase 3)
frontend/src/services/model/grid-layout.util.ts         — new, shared by Phase 3 + view-creation flows
frontend/src/components/model/ModelManager.tsx          — import/export UI + warning dialog (Phase 2-3)
frontend/src/components/metamodel/MetaAttributeEditor.tsx — enum dropdown when type=enum (Phase 1)
frontend/src/__tests__/services/ecore.service.test.ts   — round-trip tests (Phase 4)
frontend/src/__tests__/services/model-xmi.test.ts       — round-trip tests (Phase 4)
frontend/src/examples/data/library.ecore                — sample fixture (Phase 4)
frontend/src/examples/data/library.xmi                  — sample fixture (Phase 4)
```

## Coordination with concrete-syntax-metaclass refactor

Phase 1 of this plan touches `MetaClass` adjacency code in
`shared/types/index.ts` (adding `MetaEnum`). The concrete-syntax plan
*also* extends `MetaClass` (adding `concreteSyntax`). Both are purely
additive — no field collisions — but both need to land in the same
`shared/types/index.ts` edit window. Coordinate:

- If running both in parallel sub-agents, give each its own worktree
  (`isolation: "worktree"`) and merge the type-file edits manually.
- Or land Phase 1 of this plan first (touches more of `ecore.service.ts`
  than the concrete-syntax plan does), then concrete-syntax can pick up
  the updated types.

## Suggested first step

Start with **Phase 1 cleanup** — single file, all bugs are identifiable,
gives users correct metamodel interop immediately. After that, Phase 2
(model export) is the next high-leverage step because it lets users get
their existing SpatialDSLStudio models *out* into Eclipse-compatible XMI.
