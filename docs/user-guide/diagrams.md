# Views Guide (Diagram, Table, and Tree)

This guide explains how to create, edit, and manage diagram, table, and tree views. Diagram views have 2D and 3D modes. Existing routes and APIs may still use the word `diagram` for compatibility.
A tutorial video demonstrating how to design a metamodel end-to-end can be found [here](../../videos/diagram_creation.mkv).

<br><br>


<p align="center">
  <img src="../../images/2ddiagram_interface.PNG" alt="Metamodel Design" width="800"/>
</p>

## View fundamentals

A view is linked to a model. It is a projection of model elements, not a separate copy of those elements.

A view stores:

- name
- target model
- optional viewpoint and representation description
- included model element ids
- grid settings

The model stores:

- instance identity
- attributes and references
- canonical 2D/3D positions, sizes, rotation, and appearance overrides
- connection metadata

Changing a model element through one view updates the model and therefore affects every view that includes that element.

Views may also be linked to a viewpoint and representation description. The representation description controls which metaclasses are visible, which metaclasses can be created from the palette, and which notation overrides apply.

## Create, import, and export views

From the Views page you can:

- create a new view by selecting a target model
- import a view from JSON
- export an existing view as JSON
- open a view in the editor
- open code generation from a view card

Creation flow:

1. Open Views.
2. Click Create View.
3. Enter name.
4. Select model.
5. Select a viewpoint and representation if more than one is available.
6. Open view.

If no models exist, the UI prompts you to create a model first.

Executable `diagram`, `table`, and `tree` representation descriptions are selectable when creating a view.

## Table views

A table view shows one row per model element allowed by the representation's visible metaclasses. Its representation description can select and order attribute columns with `tableColumns`; without an explicit selection, all attributes used by the visible rows are shown.

- Click a column heading to sort ascending, then descending.
- Edit text, number, date, enum, and multi-valued attributes inline.
- Toggle boolean attributes with their checkbox.
- Text-like edits are written to the semantic model when the field loses focus or Enter is pressed; boolean and enum changes are written immediately.

Because edits update the semantic model, every other view over that model sees the new value.

## Tree views

A tree view derives an expandable hierarchy from containment references in the metamodel and model:

- elements with no visible container appear as roots
- containment children appear under their nearest visible ancestor
- elements outside the representation's visible metaclasses are hidden
- visible descendants of a hidden container are promoted so they remain reachable

Tree views are currently navigational; semantic edits remain available through diagram, table, or model editors.

## Switch between 2D and 3D

Inside a diagram view you can switch modes using:

- 2D Mode button
- 3D Mode button

Both modes edit the same semantic presentation with different interaction
styles. Spatial elements use a right-handed, Z-up pose in millimetres:
`position3D = { x, y, z }`, where `z` is base elevation. An aligned 2D move
updates X/Y while preserving Z; changing Z never changes 2D X/Y. Legacy views
whose schematic 2D coordinates deliberately differ from physical X/Y remain
independent.

## 2D editor workflow

### Add model elements to a view

- Drag remaining model elements from the palette onto canvas.
- Use Add all to include every model element that is not already in the view.
- A model element can appear at most once in the same view.
- Palette contents are filtered by the active representation description.

### Select and edit

- Click an element to open its properties.
- Drag nodes to reposition. Position is written back to the model element's canonical presentation data.

### Validate a view

Diagram views run the model's OCL and JavaScript constraints when the view opens.
The Validation panel lists issues whose semantic elements are visible in the
active representation, plus model-wide issues.

- A colored `!` marker identifies an affected node or edge in 2D and 3D.
- Click an issue to select its element; the 2D editor also centers it.
- Click Validate view in the panel to run validation again after edits.
- Validation does not run on every keystroke. Use the refresh action when a
  correction should be checked immediately.

### Work with mapped containers

When the active diagram representation maps a metaclass and one of its
containment references as a container:

- the semantic parent renders with a header and an inner content boundary
- visible compatible containment children render inside that boundary
- dragging a child keeps it within the container
- dragging a container moves its contained descendants by the same amount
- the mapped containment reference does not also render as an edge
- semantic pins keep their owner-boundary attachment behavior

Container dimensions currently come from the saved instance size or the
mapping's fixed default size. Automatic sizing and collapse/expand are follow-up
features.

### Create edges (references)

1. Click Create Edge in toolbar.
2. Select source node.
3. Select target node.
4. If multiple compatible references exist, select one in dialog.

Behavior notes:

- supports self-references when metamodel allows them
- edge bend points can be added by clicking empty canvas while edge drawing is active
- edge labels and containment visual markers are shown
- edges connected to semantic pins anchor to the pin center

### Run authored representation tools

When the active representation defines tools, the palette shows their authored
names and targets:

- Drag a create-node tool to the canvas to create its target model element. Any
  safe initial attribute operations are applied before the element appears.
- Click a create-edge tool, then select its source and target nodes. The tool's
  configured reference is used, so no reference-selection dialog is needed.
- Click a delete tool, then select a node or edge. Deleting a node asks for
  confirmation because it removes the semantic model element from every view;
  deleting an edge removes its semantic reference or connection.
- Click a reconnect tool, select an edge, then select its new target node. The
  target must conform to the reference type.
- Use the alert's Cancel action to leave an active interaction tool.

Delete, reconnect, and authored edge interactions are available in the 2D
editor. Create-node tools also run when placing an element in 3D. If a
representation has no authored creation tools, the palette retains its
creatable-metaclass fallback.

### Create semantic pins

Pins appear when the active representation description defines pin mappings.

Recommended flow:

1. Select a compatible owner node.
2. In the properties panel, find Pins.
3. Click the available Add Pin action.
4. Drag the pin around the owner boundary to change side and offset.

Pin behavior:

- pins are model elements with their own metaclass
- the owner reference is stored in the model
- the current view includes the new pin automatically
- the pin remains attached when the owner moves
- invalid owner/pin combinations and disallowed sides are rejected

### Navigation tools

2D toolbar provides:

- zoom in/out
- reset view
- center elements
- refresh

## 3D editor workflow

### Place elements

- Drag from palette and click on grid to place.
- A representation's 3D notation controls vertical placement. `grounded`
  elements are created at Z=0. `adjustable` elements use the configured default
  base elevation and optional minimum, maximum, and step guidance.

### Select and move

- Click element to select.
- Drag selected element directly across the ground plane to change X/Y without
  losing elevation.
- For adjustable notation, edit `Base elevation Z`, use the vertical handle, or
  choose `Snap to ground`. Step snapping is applied by the editor; configured
  limits are shown as feedback without overwriting an out-of-range stored pose.
- Selected elevated elements show a drop line, ground projection, and base-Z
  label. A grounded representation warns about, but preserves, an existing
  non-zero elevation.

### Camera and scene

- orbit controls are enabled for navigation
- scene includes grid floor and status overlay
- camera and clipping distance account for the highest element in the scene

### Grid behavior

3D editor supports grid controls with:

- independent X/Y axis sizing
- slider-based size adjustment
- axis selection for partial updates

Grid settings are persisted to view data.

### Performance handling

3D editor includes low-performance mode and WebGL error handling fallback messaging.

## Element properties panel

The properties panel supports:

- editing model element names and attributes through the view
- type-aware input fields (string, number, boolean, date)
- editing configured single- and multi-valued semantic references
- applying default values for class attributes
- edge-specific reference type handling

When a diagram representation defines property sections, only the attributes and
references named by sections applicable to the selected metaclass are shown.
Sections also work in 3D. Diagram representations without this configuration keep
the legacy 2D attribute panel; legacy 3D views keep their 3D-specific controls.

## Appearance and notation

Views use the active representation description when one is selected. Legacy views fall back to metaclass notation defined in the metamodel editor. A model element can override notation for exceptional cases, then reset back to the representation or metaclass default.

Supported notation includes 2D shapes, colors, image assets, 3D model assets,
default sizes, grounded/adjustable vertical placement, and reference edge
styling. Persisted 3D extents are `widthMm` on X, `heightMm` on Y, and
`depthMm` on Z; the editor labels these `Length X`, `Width Y`, and `Height Z`.

The palette uses the active representation description: existing elements are filtered by visible metaclasses. Authored creation tools supply the create-new-instance entries when present; otherwise those entries are filtered by creatable metaclasses.

Notation resolution order is:

1. instance presentation override
2. representation description override
3. viewpoint shared default
4. metaclass fallback
5. built-in fallback

## Delete and maintenance actions

In view list and editor workflows you can:

- delete view
- run an authored delete tool to delete a selected semantic node or edge
- remove model elements from the view without deleting them from the model
- refresh visual state after updates

## Common issues and fixes

### Cannot create view

Cause: no model selected or no model exists.

Fix: create/select model first.

### Edge creation fails

Cause: no compatible metamodel reference between selected source and target.

Fix: verify metamodel reference definitions and target compatibility.

### 3D element not placing where expected

Cause: camera angle or grid interpretation.

Fix: reorient camera, use status overlay hints, and place again on grid.

### Palette is empty

Cause: all visible model elements are already included in the current view, or the representation description hides all remaining metaclasses.

Fix: create more instances in the model editor, remove an element from the view and add it again later, or ask a DSL designer to update visible/creatable metaclasses in the representation description.

### Pin action is missing

Cause: selected node is not compatible with any pin mapping, or the pin metaclass is not visible/creatable in the active representation.

Fix: update the representation description pin mapping and visible/creatable metaclass lists.

### Imported view fails

Cause: invalid JSON or missing referenced model.

Fix: ensure referenced model exists and JSON format is correct.

## Recommended workflow

1. Create model first.
2. Create a view for that model.
3. Add existing model elements to the view.
4. Switch to 3D for spatial organization if needed.
5. Use the viewpoint representation editor for perspective-specific appearance and palette rules.
6. Use the metamodel Notation tab for fallback class-level appearance.
7. Use instance overrides only for exceptional elements.

## Relevant files

- `frontend/src/components/diagram/DiagramEditor.tsx`: Primary 2D view editor component.
- `frontend/src/components/diagram/Diagram3DEditor.tsx`: 3D view editor and interaction layer.
- `frontend/src/components/diagram/TableView.tsx`: Sortable, inline-editable table representation.
- `frontend/src/components/diagram/TreeView.tsx`: Expandable containment-tree representation.
- `frontend/src/components/palette/DiagramPalette.tsx`: Palette of model elements not yet included in the current view.
- `frontend/src/services/diagram/view-projection.service.ts`: Materializes views from model elements and references.
- `frontend/src/services/diagram/diagram.service.ts`: Frontend view/diagram compatibility service orchestration.
- `backend/src/routes/diagram.routes.ts`: Backend compatibility endpoints for view CRUD and membership updates.

## Related docs

- [Models](models.md)
- [Viewpoints and Representation Descriptions](viewpoints.md)
- [Code Generation](code-generation.md)
