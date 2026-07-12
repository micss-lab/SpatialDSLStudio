# Sirius Desktop Compatibility

SpatialDSL Studio now uses Sirius-style terminology and supports a web specifier workflow, but it is not a drop-in replacement for Eclipse Sirius Desktop.

## Compatibility Summary

| Area | Status | Notes |
|---|---:|---|
| Ecore metamodel import/export (`.ecore`) | Partial | Common single-package Ecore models round-trip. Cross-package references and custom datatypes are limited. |
| EMF XMI model import/export (`.xmi`) | Partial | Works for semantic instance data when a matching metamodel already exists. Layout and view data are not part of semantic XMI. |
| Sirius Viewpoint Specification Model (`.odesign`) import/export | Initial API slice | Backend validate/import/export endpoints cover a basic diagram subset and return compatibility reports. |
| Sirius session/representation files (`.aird`) import/export | Initial import subset | `.aird` diagram representations import as SpatialDSL views against an already-imported model and viewpoint; GMF notation layout (node bounds, edge waypoints) is preserved and unresolved references are reported. `.aird` export is not implemented; SpatialDSL views are stored as app resources, not Sirius session artifacts. |
| Sirius diagram mapping parity | Partial | Visible/creatable metaclasses, notation overrides, edge styling, and pin mappings exist. Full Sirius mappings, layers, filters, conditional styles, and tool operations are not complete. |
| Sirius table/tree editors | Not implemented | `table` and `tree` are reserved representation kinds. Only `diagram` is executable today. |

## Terminology Mapping

| SpatialDSL Studio | Sirius Desktop Equivalent | Meaning |
|---|---|---|
| Metamodel | Ecore metamodel | Semantic language definition. |
| Model | EMF semantic resource | Instance data conforming to a metamodel. |
| Viewpoint | Viewpoint in `.odesign` | Definition-level modeling perspective for one metamodel. |
| Representation Description | Diagram/table/tree description | Specification for what a view can show and create. |
| View | Representation instance | Concrete saved projection users open and edit. |
| Diagram table/API name | Compatibility name | Existing routes and schema still use `Diagram` for view resources. |

## What Can Move Between SpatialDSL And Sirius Today

You can use SpatialDSL with Sirius-adjacent semantic assets:

1. Import an Ecore `.ecore` metamodel into SpatialDSL.
2. Import or create an XMI `.xmi` model that conforms to that metamodel.
3. Create SpatialDSL viewpoints, representation descriptions, and views inside SpatialDSL.
4. Export semantic metamodel/model data back to Ecore/XMI.

What moves through the initial Sirius compatibility API:

- Basic Sirius `.odesign` files with Viewpoints and Diagram Descriptions can be validated.
- Supported node, container, bordered-node/pin, edge, basic style, and simple tool data can be imported as SpatialDSL viewpoint records.
- SpatialDSL diagram representation descriptions can be exported as generated `.odesign` XML for the supported subset.
- Sirius `.aird` diagram representations can be validated and imported as SpatialDSL views: semantic targets resolve against an already-imported model (xmi:id fragment, then unique name), representation descriptions resolve against the selected viewpoint, GMF node bounds and edge waypoints are preserved, and unresolved or ambiguous references are reported rather than silently dropped.

What does not move today:

- SpatialDSL views do not export to Sirius `.aird`; table and tree representations, layers, and filters inside `.aird` files are not imported.
- SpatialDSL view membership, layout, presentation overrides, pins, and bend points are not serialized into standard semantic XMI.
- Full Sirius `.odesign` fidelity is not implemented; unsupported layers, filters, conditional styles, Java services, and complex tool operations are reported.

## Current Feature Parity

Implemented or partially implemented:

- metamodel editing with classes, attributes, references, inheritance, enums, and constraints
- Ecore import/export foundation
- model editing and validation
- XMI import/export foundation
- views as model-backed projections
- viewpoint management UI
- diagram representation description editor
- visible and creatable metaclass filters
- representation-specific notation overrides
- reference edge notation overrides
- semantic pin nodes attached to owner boundaries
- edge anchoring to pin centers

Not yet on par with Sirius Desktop:

- full-fidelity `.odesign` import/export
- `.aird` export and full session fidelity (import covers a diagram-view subset)
- full node/container/edge mapping editor
- representation-specific creation/delete/direct-edit/reconnect tools
- operation/action language
- layers and filters
- conditional styles
- table and tree representation editors
- representation-aware validation display and quick fixes
- viewpoint-defined property panels
- multi-resource EMF sessions

## Practical Guidance

Use SpatialDSL as a Sirius-inspired web modeling workbench today. Use Ecore/XMI to exchange semantic language/model data with EMF-based tooling.

Do not assume Sirius Desktop project files are fully interchangeable with SpatialDSL project data yet. Use the `.odesign` interoperability endpoints and the `.aird` view import for the documented supported subsets, and treat fuller `.aird` compatibility (export, complete sessions) as a future interoperability feature.
