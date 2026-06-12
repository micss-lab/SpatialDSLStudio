# Concrete Syntax at the Metaclass Level

> Local working notes. Not for commit (per project markdown rules).

## Problem

Today, concrete syntax (icon, color, shape, 3D model, font, stroke) lives on
each **model element instance** via `ModelElement.presentation.appearance`
(and the legacy `ModelElement.style.appearance` JSON string). Every robot
instance carries its own appearance blob.

This is wrong in MDE terms:

- The DSL designer should declare the visual notation **once per metaclass**
  (the abstract syntax → concrete syntax mapping).
- Modelers should not have to re-pick an icon for every instance.
- Views should *project* the metaclass's notation; instance-level overrides
  should be the exception, not the rule.

## Goal

Introduce **metaclass-level concrete syntax** as the default notation, with
optional **per-instance overrides** for cases that genuinely need them
(e.g. one alarm robot in red while the rest are blue).

Resolution order at render time:

```
instance.presentation.appearance   ← override (rare)
  ↓ fallback
metaClass.concreteSyntax           ← DSL designer's notation
  ↓ fallback
defaultAppearance                  ← built-in defaults
```

## Scope

In scope:
- 2D appearance (shape, fillColor, strokeColor, strokeWidth, font, image)
- 3D appearance (modelUrl / modelFileId, default sizeMm)
- Edge styling per `MetaReference` (lineColor, lineWidth, lineDash, arrow)
- DSL-designer UI in the metamodel editor to author this
- Read-through resolution in the appearance services
- Migration of existing instance-level appearance into per-metaclass defaults
  (best-effort: pick the most common appearance per metaclass)

Out of scope (for v1):
- Conditional notation (e.g. "red when `status == 'error'`") — leave as future
  work. Note where it would slot in.
- Notation inheritance refinement (subclass overriding parent) — v1 just
  walks `superTypes` and uses the nearest defined `concreteSyntax`.

## Data model changes

### `shared/types/index.ts`

Add `concreteSyntax` to `MetaClass` and to `MetaReference`:

```ts
export interface ConcreteSyntax2D {
  shape?: 'rectangle' | 'circle' | 'ellipse' | 'diamond' | 'triangle' | 'custom-image';
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  imageFileId?: string;     // preferred — stored via fileStorageService
  imageUrl?: string;        // fallback
  fontSize?: number;
  fontFamily?: string;
  fontColor?: string;
  defaultSize?: { width: number; height: number };
}

export interface ConcreteSyntax3D {
  modelFileId?: string;     // preferred
  modelUrl?: string;        // fallback
  fallbackShape?: 'box' | 'sphere' | 'cylinder';
  fallbackColor?: string;
  defaultSizeMm?: { widthMm: number; heightMm: number; depthMm: number };
}

export interface ConcreteSyntaxEdge {
  lineColor?: string;
  lineWidth?: number;
  lineDash?: number[];
  arrowHead?: 'none' | 'open' | 'filled' | 'diamond';
  labelFormat?: string;    // future: template for edge label
}

export interface ConcreteSyntax {
  two_d?: ConcreteSyntax2D;
  three_d?: ConcreteSyntax3D;
}

export interface MetaClass extends MetamodelElement {
  // existing fields ...
  concreteSyntax?: ConcreteSyntax;
}

export interface MetaReference extends MetamodelElement {
  // existing fields ...
  concreteSyntax?: ConcreteSyntaxEdge;
}
```

### Backend persistence — no migration

Metamodels are stored as JSONB (`backend/prisma/schema.prisma:148`,
`classes Json @default("[]")`). Adding a nested `concreteSyntax` field is
**backward compatible** — old metamodels load with `undefined`, new ones get
serialized as-is. No Prisma migration needed.

Backend validation in `backend/src/services/model.service.ts` — if there is
schema validation for `classes`, extend it to accept the new optional field.
Quick grep needed to confirm.

## Resolution layer

Centralize all appearance lookup behind a single resolver so 2D, 3D, the
projection service, and the property panels all read the same answer.

### New file: `frontend/src/services/diagram/concrete-syntax.resolver.ts`

```ts
export interface ResolvedAppearance2D extends ConcreteSyntax2D {}
export interface ResolvedAppearance3D extends ConcreteSyntax3D {}

class ConcreteSyntaxResolver {
  resolve2D(element: ModelElement, metamodel?: Metamodel): ResolvedAppearance2D {
    const metaClass = findMetaClass(metamodel, element.modelElementId);
    return {
      ...DEFAULT_2D,
      ...inheritedFrom(metaClass, metamodel, 'two_d'),
      ...parseInstance(element).two_d,
    };
  }

  resolve3D(element: ModelElement, metamodel?: Metamodel): ResolvedAppearance3D { ... }

  resolveEdge(connection: ModelConnection, metamodel?: Metamodel): ConcreteSyntaxEdge { ... }
}
```

`inheritedFrom` walks `superTypes` until it finds a metaclass with
`concreteSyntax.two_d` (or `three_d`) and returns that. Cache the walk by
metaclass id within one resolution pass.

`parseInstance` reads `element.presentation.appearance` first, then the
legacy `element.style.appearance` JSON string (kept for backward
compatibility).

### Call sites to migrate

| File | Current behavior | New behavior |
|---|---|---|
| `frontend/src/services/diagram/view-projection.service.ts:90` | `stringifyAppearance(presentation.appearance) \|\| element.style?.appearance` | call resolver, write merged result into the materialized node |
| `frontend/src/services/diagram/appearance.service.ts:42-90` | parses instance only | thin wrapper around the resolver |
| `frontend/src/components/diagram/2d/utils/appearanceUtils.ts:42-79` | duplicated parser | delete, re-export from resolver |
| `frontend/src/components/diagram/Diagram3DEditor.tsx` | hardcodes color/size at drop | look up via resolver and use its `defaultSizeMm` |

Note the duplication between `appearance.service.ts` and `appearanceUtils.ts`
already — this refactor is a chance to collapse them.

## DSL Designer UI

Add a **"Notation"** tab to the metaclass editor (next to Attributes /
References / Constraints).

Location: `frontend/src/components/metamodel/MetamodelManager.tsx` plus a new
component `frontend/src/components/metamodel/MetaClassNotationEditor.tsx`.

Subsections:
1. **2D Notation** — reuse `AppearanceSelector` from
   `frontend/src/components/model/components/appearance/` but bind it to
   `metaClass.concreteSyntax.two_d` instead of `element.style.appearance`.
2. **3D Notation** — file upload for GLB/GLTF (via `fileStorageService`),
   fallback shape picker, default size in mm.
3. **Edge Notation** — per `MetaReference`, embedded in the reference row.

Preview pane: render a sample node/edge using the in-editor resolver so the
designer sees the result live.

## Instance override UX

In `ElementAppearanceSelector.tsx`, replace the current "read-only when
linked" notice with:

> **Inherited from metaclass `Robot`** [Override notation]

Click "Override notation" → unlocks the controls, edits write to
`element.presentation.appearance`. Add a "Reset to metaclass default" button
that clears the override.

## Migration path for existing data

One-time migration script: `backend/scripts/migrate-appearance-to-metaclass.ts`

Algorithm:
1. For each metamodel, for each metaclass: scan all model elements
   conforming to that class, group by appearance hash, pick the modal
   appearance, assign it to `metaClass.concreteSyntax.two_d`.
2. For each model element whose appearance matches the chosen modal
   appearance, *delete* its instance-level appearance (it now inherits).
3. Elements whose appearance differs keep their override.

This is opt-in (run via npm script), not part of `prisma migrate deploy`.
Models that were already created by hand will benefit; the smart-warehouse
sample should be re-exported with the new structure.

## Sample-project impact

The smart-warehouse JSON under `frontend/src/examples/data/` carries
appearance on each instance. After the migration script is in place:

1. Re-author the metaclass notations (robot, shelf, conveyor → distinct
   colors/icons).
2. Strip appearance from instances unless intentionally different.
3. Re-export the three JSON files.

## Rollout phases

| Phase | Deliverable | Risk |
|---|---|---|
| 1 | Type additions (`ConcreteSyntax*` interfaces), resolver service, unit tests | Low — additive |
| 2 | Wire resolver into projection + 2D + 3D render paths; keep instance-level appearance as override | Medium — every render path touched |
| 3 | DSL-designer Notation tab in metamodel editor | Medium — new UI surface |
| 4 | Instance-override UX with "Reset to default" | Low |
| 5 | Migration script + re-export sample project | Low |
| 6 | Future: conditional notation (rule-based syntax) | — |

Each phase is independently shippable.

## Open questions

- **Edge notation on `ModelConnection` vs `MetaReference`** — connections in
  the model are typed by `referenceId`; resolution should follow the
  reference. Confirm `ModelConnection.referenceId` is reliably populated by
  the projection's `materializeReferenceEdges`.
- **3D file storage scoping** — `fileStorageService` currently stores files
  per user/project. Metaclass-level GLB files probably need to be scoped to
  the metamodel (shared across all models that conform to it). May need a
  new `metamodelId` column on the file storage table.
- **Backward-compat read in legacy 2D editor** — `DiagramEditor.tsx` parses
  `element.style.appearance` directly in a few places (e.g. render code
  around line 698). The resolver-based wrapper must produce the same shape
  the existing render code expects, or those render call sites also change.
- **Validation / typing of `concreteSyntax` blob** — JSONB on the backend
  means we rely on the frontend resolver to handle missing fields
  gracefully. Acceptable; same as today.

## Files to touch (preview)

```
shared/types/index.ts                                        — add types
shared/types/index.d.ts                                      — regenerate
frontend/src/services/diagram/concrete-syntax.resolver.ts    — new
frontend/src/services/diagram/view-projection.service.ts     — use resolver
frontend/src/services/diagram/appearance.service.ts          — delegate
frontend/src/components/diagram/2d/utils/appearanceUtils.ts  — delete / re-export
frontend/src/components/diagram/DiagramEditor.tsx            — use resolver
frontend/src/components/diagram/Diagram3DEditor.tsx          — use resolver
frontend/src/components/diagram/ElementAppearanceSelector.tsx — override UX
frontend/src/components/metamodel/MetamodelManager.tsx       — Notation tab
frontend/src/components/metamodel/MetaClassNotationEditor.tsx — new
backend/scripts/migrate-appearance-to-metaclass.ts           — new
backend/src/services/model.service.ts                        — accept new field
```
