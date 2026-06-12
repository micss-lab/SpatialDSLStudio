# Viewpoints Phases 3-5 Implementation Plan

## Purpose

This plan expands phases 3, 4, and 5 from `viewpoints-ui-completion-plan.md` into implementation-ready work.

Scope:

- Phase 3: Viewpoints management screen
- Phase 4: Representation Description editor
- Phase 5: pin node interaction support

Broader parity work is tracked separately in `sirius-desktop-parity-roadmap.md`.

## Current State

Already implemented:

- shared `Viewpoint` and `RepresentationDescription` contracts
- backend `/api/viewpoints` routes and service
- optional `Diagram.viewpointId` and `Diagram.representationDescriptionId`
- Create View dialog viewpoint/representation selection
- View cards and editor header metadata
- projection filtering by visible metaclasses
- palette filtering by visible/creatable metaclasses
- notation resolution using representation/viewpoint/metaclass fallback order
- attached-node projection support for pin-like elements

Still missing:

- UI for managing viewpoint specifications
- UI for editing representation descriptions
- usable pin creation, dragging, attachment, and edge anchoring workflows

## Product Principles

- Keep **View** concrete and user-facing for saved projection instances.
- Keep **Viewpoint** definition-level and tied to a metamodel.
- Keep `/api/diagrams` and `Diagram` as compatibility names.
- Keep semantic model data in `Model`, not in Viewpoint specs.
- Keep metaclass notation as fallback notation.
- Make diagram representation descriptions executable first; reserve table/tree for later.

## Phase 3: Viewpoints Management Screen

### Objective

DSL designers can manage viewpoints for a metamodel without editing JSON.

### Recommended UX

Add a `Viewpoints` entry from each metamodel row/card and route to:

```text
/metamodels/:metamodelId/viewpoints
```

This is better than placing everything inside the visual metamodel canvas because viewpoint specs are language-workbench configuration, not metaclass diagram structure.

### New Files

- `frontend/src/components/viewpoints/ViewpointManager.tsx`
- `frontend/src/components/viewpoints/ViewpointList.tsx`
- `frontend/src/components/viewpoints/ViewpointEditor.tsx`
- `frontend/src/components/viewpoints/index.ts`

### Existing Files To Update

- `frontend/src/App.tsx`
- `frontend/src/components/metamodel/MetamodelManager.tsx`
- `frontend/src/services/viewpoint.service.ts`
- `frontend/src/models/types.ts`

### UI Layout

Use a dense management layout:

- left column: viewpoint list
- right panel: selected viewpoint details and representation descriptions
- top action bar: back to metamodels, create viewpoint

Avoid marketing-style cards. This is a designer/admin surface.

### Viewpoint List

Show:

- viewpoint name
- default marker
- description preview
- representation description count
- actions: edit, delete

Empty state:

- if none exist, show `Create Default Viewpoint`
- call backend default endpoint when user chooses that action

### Viewpoint Editor

Fields:

- name
- description
- default toggle

Actions:

- save
- cancel
- delete

Validation:

- name required
- name unique within metamodel/user context, with backend error surfaced
- default toggle should be clear that only one default should normally exist

### Representation Summary Inside Viewpoint

Show each representation description with:

- name
- kind
- default marker
- visible metaclass count
- creatable metaclass count
- notation override count
- actions: edit, duplicate, delete

### Permission Behavior

Use existing auth/role context:

- `ADMIN` and `DSL_DESIGNER`: can create/edit/delete if they can edit the metamodel
- `MODELER` and `VIEWER`: read-only

Backend already follows metamodel access. Do not add `VIEWPOINT` to `ResourceType` yet.

### Delete Behavior

Before deleting a viewpoint:

- check local diagrams for matching `viewpointId`
- show a warning if any views use it
- do not cascade-delete views

If backend delete succeeds, views with that `viewpointId` should fall back to default resolution on reload.

### Acceptance Criteria

- DSL designer can list viewpoints for a metamodel.
- DSL designer can create a viewpoint.
- DSL designer can edit viewpoint name/description/default marker.
- DSL designer can delete an unused viewpoint.
- UI warns when deleting a viewpoint used by existing views.
- Modeler/viewer sees read-only state.
- Existing Create View dialog uses newly created viewpoints after reload.

### Suggested Tests

Frontend:

- ViewpointManager loads viewpoints by metamodel.
- read-only roles cannot see edit/delete controls.
- creating a viewpoint calls `viewpointService.createViewpoint`.
- deleting a used viewpoint shows warning.

Backend:

- existing service tests should be expanded if coverage is missing for create/update/delete permission checks.

## Phase 4: Representation Description Editor

### Objective

DSL designers can define the first executable diagram representation rules from the UI.

### New Files

- `frontend/src/components/viewpoints/RepresentationDescriptionEditor.tsx`
- `frontend/src/components/viewpoints/MetaClassVisibilitySelector.tsx`
- `frontend/src/components/viewpoints/RepresentationNotationPanel.tsx`
- `frontend/src/components/viewpoints/ReferenceNotationPanel.tsx`

### Existing Files To Reuse

- `frontend/src/components/metamodel/MetaClassNotationEditor.tsx`
- `frontend/src/models/types.ts`
- `frontend/src/services/viewpoint.service.ts`
- `frontend/src/services/metamodel/metamodel.service.ts`

### Required Fields

Core:

- name
- kind
- default marker
- visible metaclasses
- creatable metaclasses

Notation:

- `concreteSyntaxByMetaClassId`
- `concreteSyntaxByReferenceId`

Reserved/display-only for now:

- edge mappings with source/target class constraints
- pin mappings
- tool definitions

### Kind Behavior

For first executable release:

- `diagram` enabled
- `table` visible as reserved/planned
- `tree` visible as reserved/planned

If table/tree are selectable for specification purposes, they must not appear in the Create View representation selector.

### Visible/Creatable Selectors

Visible selector:

- checklist of all metaclasses
- include abstract classes as visible if useful for inherited filtering
- quick action: `Select all`
- quick action: `Clear all`

Creatable selector:

- checklist of non-abstract metaclasses only
- quick action: `Use all concrete visible classes`
- quick action: `Clear all`

Validation:

- creatable metaclasses should be a subset of visible concrete metaclasses
- warn if diagram representation has zero visible metaclasses

### Notation Editor

Metaclass notation:

- list metaclasses with fallback source indicator:
  - representation override
  - viewpoint shared default
  - metaclass fallback
  - built-in fallback
- edit 2D shape/fill/stroke/default size
- edit 3D fallback shape/color/default size
- reset representation override
- copy from metaclass fallback

Reference notation:

- list references grouped by source metaclass
- edit edge color/width/dash/arrowhead/label format
- reset representation override
- copy from metaclass fallback

### Save Behavior

When saving a representation description:

1. Update the selected viewpoint's embedded `representationDescriptions`.
2. Call `viewpointService.updateRepresentationDescription`.
3. Merge returned viewpoint into cache.
4. Dispatch a UI refresh event so open views can rematerialize.

Suggested event:

```ts
window.dispatchEvent(new CustomEvent('viewpoint:changed', {
  detail: { viewpointId, representationDescriptionId }
}));
```

### Acceptance Criteria

- DSL designer can create and edit diagram representation descriptions.
- Visible metaclass choices affect existing model elements in the palette and projection.
- Creatable metaclass choices affect create-new palette entries.
- Representation notation overrides render before metaclass fallback.
- Resetting an override returns rendering to fallback notation.
- Table/tree specs are not executable in current View creation.

### Suggested Tests

Frontend:

- visible selector persists `visibleMetaClassIds`
- creatable selector excludes abstract metaclasses
- notation override writes `concreteSyntaxByMetaClassId`
- reset removes representation override
- Create View excludes table/tree

Backend:

- update representation description preserves `viewpointId`
- duplicate representation IDs are rejected or overwritten intentionally by update path

## Phase 5: Pin Node Interaction Support

### Objective

Pins become usable semantic model elements in diagram representations, especially for UML Activity diagrams.

### Current Foundation

Already present:

- `ModelElementPresentation.attachedToElementId`
- `ModelElementPresentation.attachmentSide`
- `ModelElementPresentation.attachmentOffsetRatio`
- projection can position attached nodes on owner boundaries
- `RepresentationPinMapping` contract exists

Missing:

- pin creation UX
- owner compatibility validation
- drag-to-side/offset behavior
- edge endpoint anchoring to pin center
- example data with semantic pins

### Files To Update

- `frontend/src/services/diagram/view-projection.service.ts`
- `frontend/src/services/diagram/diagram.service.ts`
- `frontend/src/components/diagram/DiagramEditor.tsx`
- `frontend/src/components/diagram/DiagramElementProperties.tsx`
- `frontend/src/components/diagram/2d/utils/appearanceUtils.ts`
- `frontend/src/components/palette/DiagramPalette.tsx`
- `backend/src/services/diagram.service.ts`
- `frontend/src/examples/data/activity-diagram-metamodel.json`
- `frontend/src/examples/data/activity-diagram-model.json`
- `frontend/src/examples/data/activity-diagram-viewpoints.json`
- `frontend/src/examples/data/activity-diagram-views.json`

### Pin Mapping Rules

Use `RepresentationPinMapping`:

```ts
interface RepresentationPinMapping {
  id: string;
  pinMetaClassIds: string[];
  ownerMetaClassIds: string[];
  attachmentReferenceName?: string;
  direction?: 'input' | 'output' | 'inout';
  allowedSides?: Array<'top' | 'right' | 'bottom' | 'left'>;
  defaultSide?: 'top' | 'right' | 'bottom' | 'left';
  defaultOffsetRatio?: number;
}
```

### Creation UX

Palette behavior:

- pin metaclasses can appear in create-new list only when selected/hovered owner is compatible
- alternatively add contextual action on compatible owner:
  - `Add Input Pin`
  - `Add Output Pin`

Recommended first implementation:

- create contextual buttons in element properties for compatible selected owner
- avoid ambiguous drag-from-palette owner selection in the first pass

When creating a pin:

1. Create a normal `ModelElement` for the pin metaclass.
2. Set its semantic owner reference using `attachmentReferenceName` or fallback `owner`.
3. Set presentation:

   ```ts
   {
     attachedToElementId: ownerId,
     attachmentSide: defaultSide,
     attachmentOffsetRatio: defaultOffsetRatio ?? 0.5,
     size2D: { width: 16, height: 16 }
   }
   ```

4. Include pin in current view membership.

### Drag Behavior

For pin nodes:

1. During drag, detect owner bounds.
2. Find nearest owner side.
3. Clamp pointer projection to that side.
4. Compute offset ratio from 0 to 1.
5. Persist only:

   ```ts
   attachmentSide
   attachmentOffsetRatio
   attachedToElementId
   ```

Do not persist arbitrary `position2D` for attached pins unless detached behavior is explicitly added later.

### Owner Move Behavior

When an owner moves:

- existing projection already recomputes attached pin positions
- ensure selected pin remains selected after owner move
- ensure edges refresh after move

### Edge Anchoring

Update 2D edge anchor calculation:

- if source/target element is a pin, use pin center
- otherwise use normal node anchor behavior

For object-flow style edges:

- pin-to-node
- node-to-pin
- pin-to-pin

### Validation

Backend and frontend should both protect against invalid pin ownership:

- pin metaclass must be in mapping `pinMetaClassIds`
- owner metaclass must be in mapping `ownerMetaClassIds`
- side must be allowed by `allowedSides` if present

Backend validation should run when creating model element in view if pin attachment metadata is present.

### Activity Example Upgrade

Update UML Activity example:

- add `Pin`
- add `InputPin`
- add `OutputPin`
- add owner reference from `Pin` to `Action`
- add `ObjectFlow` if not present
- add one input pin and one output pin attached to an action
- add object-flow connection to/from pins
- add `pinMappings` to `Activity Diagram`

### Acceptance Criteria

- Input pin renders attached to left side of an Action.
- Output pin renders attached to right side of an Action.
- Moving the Action moves attached pins.
- Dragging a pin changes side/offset on owner boundary.
- Edges connect to pin center.
- Pin semantic owner reference is persisted in the model.
- View membership controls pin visibility.
- Invalid owner/pin combinations are rejected.

### Suggested Tests

Frontend:

- pin projection computes expected x/y from owner bounds and side/offset
- dragging pin persists side/offset
- edge anchor for pin uses center point
- incompatible owner disables add-pin command

Backend:

- create pin in view validates owner metaclass
- invalid side rejected when `allowedSides` is present
- pin create stores semantic reference and presentation attachment metadata

## Next Phase After 3-5

After phases 3-5, implement Phase 6 from `viewpoints-ui-completion-plan.md`:

```text
Phase 6: Example Data Completion
```

The next phase should make examples demonstrate the feature without JSON inspection:

- Smart Warehouse should show clearly different representations and palettes.
- UML Activity should include semantic pins, object flows, and pin mappings.
- Legacy examples should still open through fallback behavior.

Phase 6 should be followed by:

- Phase 7: tests
- Phase 8: documentation and screenshots/walkthroughs

## Relationship To Sirius Desktop Parity

Phases 3-5 move SpatialDSL toward a Sirius-style web specifier experience, but they are not full Sirius Desktop parity.

Tracked separately:

- `sirius-desktop-parity-roadmap.md`

That roadmap should own larger topics such as:

- `.odesign` import/export
- full diagram mapping model
- table/tree editors
- model operation language
- layers/filters
- properties view customization
- validation and quick fixes
- multi-resource EMF session handling

## Implementation Order

Recommended order:

1. Phase 3 route and ViewpointManager shell.
2. Viewpoint list/editor CRUD.
3. Representation list inside selected viewpoint.
4. Phase 4 representation editor core fields.
5. Visible/creatable metaclass selectors.
6. Representation notation overrides.
7. Phase 5 pin mapping read/display.
8. Pin creation from selected compatible owner.
9. Pin drag side/offset behavior.
10. Pin edge anchoring.
11. Activity example semantic pin upgrade.
12. Focused tests and docs updates.

## Verification Commands

Backend:

```bash
cd backend
npm run typecheck
npm test -- --runInBand src/__tests__/services/diagram.service.test.ts
```

Frontend:

```bash
cd frontend
npm run build
```

Manual verification:

- create/edit/delete viewpoint for a metamodel
- create/edit diagram representation description
- create a View using a new representation description
- verify palette visible/creatable filtering
- verify notation override rendering
- open Activity example and verify pins attach to action boundary
- drag pin and verify side/offset persistence
- verify old views still open
