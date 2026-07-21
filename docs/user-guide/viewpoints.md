# Viewpoints and Representation Descriptions

Use viewpoints when one metamodel needs multiple modeling perspectives over the same semantic model.

A View is the concrete saved projection users open and edit. A Viewpoint is definition-level: it belongs to a metamodel and groups representation descriptions such as diagrams, tables, or trees. The current editor executes `diagram` representation descriptions; `table` and `tree` are reserved specification kinds.

This terminology intentionally follows Sirius concepts, but SpatialDSL stores its own viewpoint records internally. The viewpoint manager includes a Sirius compatibility workflow for validating/importing supported `.odesign` files and exporting `.odesign` or a project ZIP wrapper with a compatibility report. Sirius `.aird` session and diagram resources are recognized as deferred compatibility data.

## Layering

SpatialDSL follows this MDE split:

```text
Metamodel
  -> Viewpoint
      -> Representation Description
          -> View
```

The model remains the semantic source of truth. View membership, layout, notation overrides, and palette rules are separate from Ecore/XMI semantic data.

## Manage Viewpoints

Open the viewpoint manager from a metamodel row:

1. Open Metamodels.
2. Find the target metamodel.
3. Click the Viewpoints action.
4. Use `/metamodels/:metamodelId/viewpoints` to manage specification data for that metamodel.

The manager has:

- left column: viewpoints for the metamodel
- right side: selected viewpoint details and representation descriptions
- actions for create, save, duplicate, and delete where the current role allows editing

Role behavior:

- `ADMIN` and `DSL_DESIGNER` can create and edit when they can edit the metamodel
- `MODELER` and `VIEWER` see read-only state

If a metamodel has no viewpoints, use Create Default Viewpoint to generate a baseline diagram representation from the metamodel.

## Viewpoint Fields

A viewpoint contains:

- name
- description
- default marker
- representation descriptions
- optional shared notation defaults

Only one default viewpoint should normally exist per metamodel. The backend enforces safer default handling and rejects duplicate viewpoint names within the same metamodel.

Deleting a viewpoint does not delete existing views. If a view references a deleted viewpoint, it falls back to default viewpoint/representation resolution on reload.

## Representation Descriptions

A representation description defines what a concrete view can show and create.

Core fields:

- name
- kind: `diagram`, `table`, or `tree`
- default marker
- visible metaclasses
- creatable metaclasses

Current executable behavior:

- `diagram` is executable in the 2D/3D view editors
- `table` is executable as a read-only table view (rows are model elements of the visible metaclasses; columns are their attributes) and is selectable in Create View
- `tree` is reserved and does not yet appear as an executable Create View choice

Visible metaclasses control which model elements appear in a view. Creatable metaclasses control which new-instance entries appear in the view palette. Creatable classes must be concrete and visible.

## Node And Edge Mappings

The representation editor also exposes Sirius-style mappings:

- **Node mappings**: every visible concrete metaclass is a node mapping. Each row shows its notation source, a creatable toggle, and a jump to its style editor.
- **Edge mappings**: with no edge mappings, every metamodel reference can be drawn as an edge. Add an edge mapping to restrict which references become edges (by source and target metaclass) and to give that edge its own line color, width, and arrowhead. Edge mappings round-trip through `.odesign` export/import.

## Tools

The representation editor also authors palette and interaction tools: node creation (targeting a metaclass), edge creation (targeting a reference), delete, direct edit, and reconnect. Tool names round-trip through `.odesign` export. Tool definitions are authored per representation description; execution currently falls back to the default palette built from creatable metaclasses.

## Notation Resolution

When a view is rendered, notation is resolved in this order:

1. instance presentation override
2. representation description concrete syntax
3. viewpoint shared defaults
4. metaclass fallback concrete syntax
5. built-in fallback

Metaclass notation is still useful as fallback notation for simple metamodels and legacy views.

## Notation Overrides

Representation descriptions can override:

- metaclass 2D notation: shape, fill, stroke, size, and text settings
- metaclass 3D fallback notation: shape, color, and default size
- reference edge notation: line color, width, dash pattern, arrowhead, and labels

Use metaclass notation for defaults that apply everywhere. Use representation notation when one viewpoint needs a different appearance for the same semantic concept.

## Pins And Attached Nodes

Diagram representation descriptions can include pin mappings. Pins are normal semantic model elements, not decorative handles.

A pin mapping defines:

- pin metaclasses
- compatible owner metaclasses
- optional semantic owner reference name
- direction: input, output, or inout
- allowed sides
- default side and offset

In the 2D view editor:

1. Select a compatible owner node.
2. Use the Pins section in the properties panel.
3. Add an input/output pin.
4. Drag the pin around the owner boundary to change side and offset.

Pin behavior:

- the pin is added to the model and current view
- the semantic owner reference is persisted on the pin model element
- moving the owner moves attached pins through projection
- dragging a pin stores `attachedToElementId`, `attachmentSide`, and `attachmentOffsetRatio`
- edges connected to pins anchor to the pin center
- invalid pin/owner/side combinations are rejected by frontend checks and backend validation

## Examples

The Smart Warehouse example includes a `Warehouse Operations` viewpoint with diagram representation descriptions for the floor plan, fleet/charging, and material flow concerns.

The UML Activity example includes a `UML Activity` viewpoint with an executable `Activity Diagram` representation, semantic input/output pins, object flows, and a reserved `Activity Node Inventory` table specification.

## Compatibility

The API path and database table remain `/api/diagrams` and `Diagram` for compatibility. User-facing terminology should treat these as Views: concrete saved representation instances.

SpatialDSL viewpoints are Sirius-style concepts stored as SpatialDSL records. Use the Sirius compatibility actions or API for the supported `.odesign` subset; `.aird` representation/session interchange remains deferred. For import/export expectations, see [Sirius Desktop Compatibility](../reference/sirius-compatibility.md).
