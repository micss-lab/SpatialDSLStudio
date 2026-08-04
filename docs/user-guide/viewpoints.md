# Viewpoints and Representation Descriptions

Use viewpoints when one metamodel needs multiple modeling perspectives over the same semantic model.

A View is the concrete saved projection users open and edit. A Viewpoint is definition-level: it belongs to a metamodel and groups executable diagram, table, and tree representation descriptions.

This terminology intentionally follows Sirius concepts, but SpatialDSL stores its own viewpoint records internally. The viewpoint manager includes a Sirius compatibility workflow for validating/importing supported `.odesign` files, exporting individual `.odesign`/`.aird` resources, or exporting a complete single-model Eclipse Sirius project ZIP (`.ecore` + `.xmi` + `.odesign` + `.aird`) with a compatibility report. Supported `.aird` diagram resources can also be imported and exported through the interoperability API.

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
- `table` is executable as a sortable, inline-editable table; an optional `tableColumns` list selects and orders the attributes shown
- `tree` is executable as an expandable containment hierarchy
- all three kinds are selectable in Create View and persist through the view API

Visible metaclasses control which model elements appear in a view. Creatable metaclasses control which new-instance entries appear in the view palette. Creatable classes must be concrete and visible.

`tableColumns` is currently SpatialDSL-specific representation metadata. Sirius `.odesign` import/export has no mapping for it in the supported subset.

## Property Sections

Diagram representation descriptions can group the semantic fields exposed by the
2D/3D element properties panel. Each property section defines:

- a stable ID and displayed section name
- optional metaclass IDs; an empty list applies to all visible metaclasses
- attribute names to render with type-aware editors
- reference names to render with type-compatible target selectors

Sections configured for a superclass also apply to its subclasses. A non-empty
property-section list is diagram-only and replaces the legacy semantic-field list
for that representation. Name, appearance, pin, and layout controls remain editor
controls outside the semantic sections.

Property sections are SpatialDSL-native metadata. They do not import from or
export to Sirius custom property-view definitions in the supported `.odesign`
subset.

## Node, Edge, And Container Mappings

The representation editor also exposes Sirius-style mappings:

- **Node mappings**: every visible concrete metaclass is a node mapping. Each row shows its notation source, a creatable toggle, and a jump to its style editor.
- **Container mappings**: for a diagram representation, choose a container metaclass and one of its containment references. Visible compatible children of that reference render inside the parent using the container's configured style and fixed size. The containment reference is structural and does not also render as an edge.
- **Edge mappings**: with no edge mappings, every metamodel reference can be drawn as an edge. Add an edge mapping to restrict which references become edges (by source and target metaclass) and to give that edge its own line color, width, and arrowhead. Edge mappings round-trip through `.odesign` export/import.

Container mappings are diagram-only. They round-trip as Sirius
`containerMappings`/`subNodeMappings`; their concrete view hierarchy round-trips
as nested GMF nodes in `.aird`. Automatic container sizing, collapse/expand, and
non-containment grouping are not implemented yet.

## Tools

The representation editor authors palette and interaction tools: node creation
(targeting a metaclass), edge creation (targeting a reference), delete, direct
edit, and reconnect. Tool names round-trip through `.odesign` export.

In SpatialDSL diagram editors, authored create-node, create-edge, delete, and
reconnect definitions are executable. When a representation has authored
creation tools, the palette uses their names and targets; otherwise it falls
back to the representation's creatable metaclasses. Direct-edit definitions are
stored but do not yet run custom logic beyond the editor's built-in property
editing.

A create-node tool can initialize scalar attributes in its `payload`:

```json
{
  "operations": [
    {
      "type": "set-attribute",
      "attributeName": "BatteryLevel",
      "value": 100
    }
  ]
}
```

The viewpoint editor exposes these as **Initial attribute operations**. Only
declared, single-valued attributes can be set. Values are limited to strings,
finite numbers, booleans, or `null`, are checked/coerced against the attribute
type at execution time, and are never evaluated as expressions. A tool accepts
at most 50 operations.

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
- metaclass 3D fallback notation: shape, color, default size, and vertical
  placement policy
- reference edge notation: line color, width, dash pattern, arrowhead, and labels

Use metaclass notation for defaults that apply everywhere. Use representation notation when one viewpoint needs a different appearance for the same semantic concept.

For 3D notation, `verticalPlacement.mode` is `grounded` by default. Choose
`adjustable` to let Modelers edit base elevation and optionally set
`defaultBaseZMm`, `minBaseZMm`, `maxBaseZMm`, and `stepMm`. This is a general
placement policy for drones, shelf sensors, cranes, and mezzanine equipment;
it is not an aerial-domain flag.

Vertical-placement policies are validated when they are authored, imported, or
saved through the API. The mode must be `grounded` or `adjustable`; supplied
numeric values must be finite; `stepMm` must be positive; the minimum cannot
exceed the maximum; and the default must fall within any supplied bounds. These
limits describe editing behavior in a representation. They do not globally
reject an instance elevation imported without that representation.

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

The Smart Warehouse example includes a `Warehouse Operations` viewpoint that
demonstrates all three executable view types: floor-plan, fleet/charging,
material-flow, and `Aerial Inspection` diagrams; an editable `Robot Fleet
Inventory` table; and an expandable `Warehouse Resource Hierarchy` tree. The
aerial representation gives `InspectionDrone` adjustable placement from 0 to
10,000 mm with a 3,000 mm creation default and 100 mm step. Its two saved drone
instances demonstrate landed Z=0 and airborne Z=4,500 mm placement.

The UML Activity example includes a `UML Activity` viewpoint with an executable `Activity Diagram` representation, containment-driven activity containers, semantic input/output pins, object flows, and an editable `Activity Node Inventory` table.

## Compatibility

The API path and database table remain `/api/diagrams` and `Diagram` for compatibility. User-facing terminology should treat these as Views: concrete saved representation instances.

SpatialDSL viewpoints are Sirius-style concepts stored as SpatialDSL records. Use the Sirius compatibility actions or API for the supported `.odesign` and `.aird` diagram subsets. For import/export expectations, see [Sirius Desktop Interoperability](../reference/sirius-desktop-interop.md).
