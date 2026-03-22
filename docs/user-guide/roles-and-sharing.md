# Roles and Sharing Guide

This guide explains who can do what and how resource sharing works across users.

## Authentication basics

The platform uses token-based authentication.

Core user actions:

- register account
- login
- logout
- automatic session invalidation handling on unauthorized responses

After login/logout, client caches are refreshed to ensure data visibility matches current user permissions.

## Role hierarchy

Roles from lowest to highest:

1. `VIEWER`
2. `MODELER`
3. `DSL_DESIGNER`
4. `ADMIN`

Higher roles include lower-role capabilities, with feature-specific restrictions where applicable.

## High-level capability matrix

### VIEWER

- view resources
- cannot create/edit/delete/share

### MODELER

- edit/view model-level content
- can run some operations (for example execution/generation paths)
- cannot create metamodels or share resources

### DSL_DESIGNER

- create/edit/delete most modeling resources
- can share owned resources
- can edit metamodel definitions

### ADMIN

- all DSL_DESIGNER capabilities
- admin-level user management capabilities

## Resource ownership model

Every major resource has an owner.

Owner rules:

- owner has strongest control over own resource
- deletion is owner-restricted for many resource types
- sharing operations require ownership checks

## Sharing basics

Shareable resource types include:

- METAMODEL
- MODEL
- DIAGRAM
- TRANSFORMATION_RULE
- CODEGEN_PROJECT
- TEST_CASE

Sharing is typically done by email and creates an access record between owner and recipient.

## Share permission levels

Two sharing permission levels are supported:

- `VIEWER`: read-only access
- `EDITOR`: view + edit access (subject to recipient role restrictions)

Important: role restrictions still apply. Example: a global `VIEWER` role user remains effectively read-only, even if shared with `EDITOR` permission.

## Who can share

Share initiation is restricted to roles with sharing privileges.

In practice:

- sharing endpoints enforce role checks
- owners must own the resource they attempt to share
- sharing with yourself is blocked

## Cascading sharing behavior

Sharing can cascade to dependencies to keep resources usable.

Examples:

- sharing a model can also share its metamodel
- sharing a diagram can also share its model and metamodel
- sharing a code generation project can also share target metamodel and related owned models/diagrams

If dependency ownership belongs to another user, sharing may return warnings so recipient can request access from the actual owner.

## Shared resource views

Users can access:

- resources they own
- resources shared with them

APIs and UI can also expose:

- who a resource is shared with (owner view)
- resources shared with current user
- effective permission for current user on a resource

## Why actions may be blocked

Common causes:

- not authenticated
- role does not allow operation
- user is not owner for owner-only action
- resource shared as `VIEWER` when edit action attempted
- resource not shared with current user

## Typical scenarios

### “I can open but cannot edit”

Likely reason:

- shared as `VIEWER` or your user role is too restrictive.

### “I cannot share this item”

Likely reason:

- you are not owner, or your role does not allow sharing.

### “Shared diagram opens but related data is missing”

Likely reason:

- dependency resource is owned by another user and was not shareable in the same cascade path.

## Recommended collaboration workflow

1. Owner prepares stable metamodel/model base.
2. Owner shares with `VIEWER` or `EDITOR` depending on collaboration needs.
3. Recipients verify access from shared resources view.
4. If dependencies are missing, request direct share from dependency owner.

## Relevant files

- `frontend/src/contexts/AuthContext.tsx`: Client authentication state, role checks, and permission helpers.
- `frontend/src/services/common/sharing.service.ts`: Frontend share/unshare and shared-resource API calls.
- `backend/src/routes/share.routes.ts`: Backend sharing endpoints by resource type and permission level.
- `backend/src/middleware/permissions.ts`: Central role/resource permission checks used by route handlers.
- `backend/src/services/sharing.service.ts`: Sharing business logic including cascade behavior.

## Related docs

- [Metamodels](metamodels.md)
- [Models](models.md)
- [API Reference](../reference/api.md)
