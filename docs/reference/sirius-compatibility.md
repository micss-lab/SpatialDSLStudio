# Sirius Desktop Compatibility

SpatialDSL Studio now uses Sirius-style terminology and supports a web specifier workflow, but it is not a drop-in replacement for Eclipse Sirius Desktop.

## Compatibility Summary

| Area | Status | Notes |
|---|---:|---|
| Ecore metamodel import/export (`.ecore`) | Partial | Common single-package Ecore models round-trip. Cross-package references and custom datatypes are limited. |
| EMF XMI model import/export (`.xmi`) | Partial | Works for semantic instance data when a matching metamodel already exists. Layout and view data are not part of semantic XMI. |
| Sirius Viewpoint Specification Model (`.odesign`) import/export | Initial API slice | Backend validate/import/export endpoints cover a diagram subset including node, containment-driven container, edge, pin, basic style, and simple tool mappings. |
| Sirius session/representation files (`.aird`) import/export | Initial bidirectional subset | Diagram representations import against an already-imported model/viewpoint and export from SpatialDSL views. Supported GMF node bounds, nested container children, and edge waypoints round-trip; full Sirius session fidelity is not claimed. |
| Sirius diagram mapping parity | Partial | Visible/creatable metaclasses, node/container/edge editors, notation, pins, native create/delete/reconnect tools, plus `.odesign` layers, filters, and conditional-style preservation exist. Reused mappings and Sirius operation trees are not complete. |
| SpatialDSL table/tree editors | Implemented | Tables support configured columns, sorting, and semantic inline edits; trees render containment hierarchies. Sirius table/tree interchange remains unsupported. |
| SpatialDSL validation/property workflow | Implemented natively | Diagram views show OCL/JS issues with 2D/3D markers and navigation; representation descriptions configure attribute/reference sections. Sirius validation-rule, quick-fix, and custom property-view interchange remains unsupported. |

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
- Containment-driven `.odesign` container mappings import/export with their nested subnode mapping and basic container style.
- Sirius `.aird` diagram representations can be validated and imported as SpatialDSL views: semantic targets resolve against an already-imported model (xmi:id fragment, then unique name), representation descriptions resolve against the selected viewpoint, GMF node bounds, nested parent/child structure, and edge waypoints are preserved, and unresolved or ambiguous references are reported rather than silently dropped.
- SpatialDSL diagram views can be exported to the supported `.aird` subset; container children are emitted as nested GMF nodes with relative bounds.

What does not move today:

- Full Sirius session/resource fidelity is not implemented; table and tree representations, layers, and filters inside `.aird` files are not imported or exported.
- SpatialDSL view membership, layout, presentation overrides, pins, and bend points are not serialized into standard semantic XMI.
- Full Sirius `.odesign` fidelity is not implemented; layers, common filters,
  and conditional styles now round-trip, while reused mappings, style
  customizations, Java services, and complex tool operations are reported.
- SpatialDSL's `set-attribute` tool payload is native JSON metadata and does not round-trip as a Sirius model-operation tree through `.odesign`.

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
- containment-driven container mapping editor and nested diagram projection
- semantic pin nodes attached to owner boundaries
- edge anchoring to pin centers
- representation-specific create-node, create-edge, delete, and reconnect execution
- safe create-node attribute initialization through a minimal `set-attribute` payload
- configurable, sortable, inline-editable table representations
- expandable containment-tree representations
- representation-aware OCL/JavaScript issue panels, navigation, and 2D/3D markers
- representation-defined attribute/reference property sections

Not yet on par with Sirius Desktop:

- full-fidelity `.odesign` import/export
- full `.aird` session/resource fidelity beyond the bidirectional diagram subset
- advanced and reused diagram mappings, compartments, and automatic/collapsible container layout
- custom direct-edit tool behavior
- full Sirius model-operation/action trees, expressions, and Java services
- runtime application of imported layer/filter/conditional-style expressions
- conditional styles
- Sirius table/tree representation interchange through `.odesign` or `.aird`
- validation quick fixes, severity filtering, and optional live revalidation
- Sirius validation-rule and custom property-view interchange
- multi-resource EMF sessions

## Practical Guidance

Use SpatialDSL as a Sirius-inspired web modeling workbench today. Use Ecore/XMI to exchange semantic language/model data with EMF-based tooling.

Do not assume Sirius Desktop project files are fully interchangeable with SpatialDSL project data yet. Use the `.odesign` and `.aird` interoperability endpoints for the documented supported subsets, and treat complete multi-resource Sirius session fidelity as future work.
