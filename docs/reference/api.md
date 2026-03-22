# API Reference

Technical reference for backend endpoints under `/api`.

## Base URL and auth

- Base path: `/api`
- Authentication: `Authorization: Bearer <token>`
- Public endpoints: `/api/health`, `/api/auth/*` (except protected auth operations)
- Most resource endpoints require authentication middleware

## Response conventions

Most resource routes return:

```json
{
   "success": true,
   "data": {}
}
```

Error shape (common):

```json
{
   "success": false,
   "error": "message"
}
```

Validation failures can also include:

- `details[]` with `field` and `message`

Note: auth routes have some responses without `success` wrapper (for example direct `{ user, token }` payloads).

## Auth endpoints

Base: `/api/auth`

- `POST /register`
- `POST /login`
- `GET /me` (auth required)
- `POST /change-password` (auth required)
- `POST /verify`

Security notes:

- auth routes are rate-limited
- token verification can return `valid: false` responses

## Health endpoint

- `GET /api/health`

Returns service heartbeat and timestamp.

## EPackage (meta-metamodel) endpoints

Base: `/api/epackages`

- `GET /`
- `GET /core`
- `GET /:id`
- `GET /uri/:nsURI`
- `POST /`
- `PUT /:id`
- `DELETE /:id`

## Metamodel endpoints

Base: `/api/metamodels`

- `GET /`
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/classes`
- `PUT /:id/classes/:classId`
- `DELETE /:id/classes/:classId`
- `POST /:id/constraints`
- `POST /:id/classes/:classId/constraints`

## Model endpoints

Base: `/api/models`

- `GET /` (optional query: `metamodelId`)
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/elements`
- `PUT /:id/elements/:elementId`
- `DELETE /:id/elements/:elementId`
- `POST /:id/connections`
- `DELETE /:id/connections/:connectionId`

## Diagram endpoints

Base: `/api/diagrams`

- `GET /` (optional query: `modelId`)
- `GET /:id`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
- `POST /:id/elements`
- `PUT /:id/elements/:elementId`
- `DELETE /:id/elements/:elementId`
- `PUT /:id/grid-settings`

## Transformation endpoints

Base: `/api/transformations`

Rule CRUD:

- `GET /rules`
- `GET /rules/:id`
- `POST /rules`
- `PUT /rules/:id`
- `DELETE /rules/:id`

Compatibility routes:

- `GET /patterns` (returns empty list)
- `POST /patterns` (no-op passthrough)
- `PUT /patterns/:id` (no-op passthrough)
- `DELETE /patterns/:id` (no-op)
- `GET /executions` (returns empty list)

## Code generation endpoints

Base: `/api/codegen`

- `GET /projects` (optional query: `metamodelId`)
- `GET /projects/:id`
- `POST /projects`
- `PUT /projects/:id`
- `DELETE /projects/:id`
- `POST /projects/:id/templates`
- `PUT /projects/:id/templates/:templateId`
- `DELETE /projects/:id/templates/:templateId`

## Testing endpoints

Base: `/api/tests`

- `GET /`
- `GET /cases` (alias)
- `POST /cases`
- `PUT /cases/:id`
- `GET /:id`
- `POST /`
- `POST /batch`
- `PUT /:id`
- `PUT /:id/status`
- `PUT /:id/values`
- `DELETE /:id`
- `DELETE /model/:modelId`
- `POST /model/:modelId/reset`

## File storage endpoints

Base: `/api/files`

- `GET /`
- `GET /stats`
- `GET /:id`
- `GET /:id/data`
- `GET /:id/download`
- `POST /upload` (multipart)
- `POST /upload-base64`
- `PUT /:id/metadata`
- `DELETE /:id`
- `POST /cleanup`

## Sharing endpoints

Base: `/api/share`

- `POST /:resourceType/:resourceId/share`
- `DELETE /:resourceType/:resourceId/share/:userId`
- `GET /:resourceType/:resourceId/shares`
- `GET /shared-with-me`
- `GET /:resourceType/:resourceId/access`

Valid resource types:

- `METAMODEL`
- `MODEL`
- `DIAGRAM`
- `TRANSFORMATION_RULE`
- `CODEGEN_PROJECT`
- `TEST_CASE`

Valid share permissions:

- `VIEWER`
- `EDITOR`

## Admin endpoints

Base: `/api/admin` (ADMIN role required)

User management:

- `GET /users`
- `GET /users/:userId`
- `PATCH /users/:userId/role`
- `POST /users/:userId/reset-password`
- `DELETE /users/:userId`
- `POST /users/bulk/role`
- `POST /users/bulk/delete`

Resource and system:

- `GET /stats`
- `GET /resources`
- `GET /resources/:type/:resourceId`
- `DELETE /resources/:type/:resourceId`
- `POST /resources/:type/:resourceId/transfer`
- `POST /resources/:type/:resourceId/unshare`
- `GET /health`

## Role/permission summary

- Auth middleware protects all non-public route groups.
- Resource operations are further constrained by role and ownership/share checks.
- Sharing creation is restricted to allowed roles and owner verification.

## Related docs

- [Roles and Sharing](../user-guide/roles-and-sharing.md)
- [Data Model](data-model.md)
