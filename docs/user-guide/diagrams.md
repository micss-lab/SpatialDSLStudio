# Diagrams Guide (2D and 3D)

This guide explains how to create, edit, and manage diagrams in both 2D and 3D modes.
A tutorial video demonstrating how to design a metamodel end-to-end can be found [here](../../videos/diagram_creation.mkv).

<br><br>


<p align="center">
  <img src="../../images/2ddiagram_interface.PNG" alt="Metamodel Design" width="800"/>
</p>

## Diagram fundamentals

A diagram is linked to a model. Diagram elements are visual representations of model/metamodel concepts, and can include:

- node elements
- edge elements (references)
- visual style and appearance data
- optional link to specific model elements

## Create, import, and export diagrams

From the Diagrams page you can:

- create a new diagram by selecting a target model
- import a diagram from JSON
- export an existing diagram as JSON
- open a diagram in editor
- open code generation from a diagram card

Creation flow:

1. Open Diagrams.
2. Click Create Diagram.
3. Enter name.
4. Select model.
5. Open diagram.

If no models exist, the UI prompts you to create a model first.

## Switch between 2D and 3D

Inside diagram editor page you can switch modes using:

- 2D Mode button
- 3D Mode button

Both modes edit the same diagram resource with different interaction styles.

## 2D editor workflow

### Add nodes

- Drag classes from palette onto canvas.
- Elements are created as diagram nodes.

### Select and edit

- Click an element to open its properties.
- Drag nodes to reposition.

### Create edges (references)

1. Click Create Edge in toolbar.
2. Select source node.
3. Select target node.
4. If multiple compatible references exist, select one in dialog.

Behavior notes:

- supports self-references when metamodel allows them
- edge bend points can be added by clicking empty canvas while edge drawing is active
- edge labels and containment visual markers are shown

### Navigation tools

2D toolbar provides:

- zoom in/out
- reset view
- center elements
- refresh

## 3D editor workflow

### Place elements

- Drag from palette and click on grid to place.

### Select and move

- Click element to select.
- Drag selected element directly to move it.

### Camera and scene

- orbit controls are enabled for navigation
- scene includes grid floor and status overlay

### Grid behavior

3D editor supports grid controls with:

- independent X/Y axis sizing
- slider-based size adjustment
- axis selection for partial updates

Grid settings are persisted to diagram data.

### Performance handling

3D editor includes low-performance mode and WebGL error handling fallback messaging.

## Element properties panel

The properties panel supports:

- editing diagram-visible name and attributes
- type-aware input fields (string, number, boolean, date)
- applying default values for class attributes
- edge-specific reference type handling

## Linking diagram elements to model elements

Diagram nodes can link to concrete model elements.

When linked:

- diagram can display linked model properties
- appearance may be inherited from linked model element
- some local appearance editing is restricted to preserve consistency

## Appearance customization

Diagram elements support appearance configuration similar to model appearance options:

- geometric shapes (square, rectangle, circle, triangle, star)
- custom image
- custom 3D model
- fill color and preview

Custom image and 3D model files can be uploaded through appearance controls.

## Delete and maintenance actions

In diagrams list and editor workflows you can:

- delete diagram
- delete nodes/edges
- refresh visual state after updates

## Common issues and fixes

### Cannot create diagram

Cause: no model selected or no model exists.

Fix: create/select model first.

### Edge creation fails

Cause: no compatible metamodel reference between selected source and target.

Fix: verify metamodel reference definitions and target compatibility.

### 3D element not placing where expected

Cause: camera angle or grid interpretation.

Fix: reorient camera, use status overlay hints, and place again on grid.

### Appearance edits seem locked

Cause: element is linked to model element and inherits appearance.

Fix: adjust appearance at model-element level or unlink first.

### Imported diagram fails

Cause: invalid JSON or missing referenced model.

Fix: ensure referenced model exists and JSON format is correct.

## Recommended workflow

1. Create model first.
2. Create diagram for that model.
3. Build layout in 2D.
4. Switch to 3D for spatial organization if needed.
5. Link nodes to model elements where appropriate.
6. Finalize appearance and edge routing.

## Relevant files

- `frontend/src/components/diagram/DiagramEditor.tsx`: Primary 2D diagram editor component.
- `frontend/src/components/diagram/Diagram3DEditor.tsx`: 3D diagram editor and interaction layer.
- `frontend/src/components/diagram/RuleVisualizationPanel.tsx`: Panel for visualizing transformation rules on diagrams.
- `frontend/src/services/diagram/diagram.service.ts`: Frontend diagram service orchestration.
- `backend/src/routes/diagram.routes.ts`: Backend API endpoints for diagram CRUD and element updates.

## Related docs

- [Models](models.md)
- [Code Generation](code-generation.md)
