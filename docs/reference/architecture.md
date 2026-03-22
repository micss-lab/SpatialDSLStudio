# Architecture

This document describes how backend, frontend, shared contracts, and deployment topology work together.

## System overview

The project is a full-stack modeling platform composed of:

- React frontend (`frontend/`)
- Express + Prisma backend (`backend/`)
- shared TypeScript contracts (`shared/`)
- PostgreSQL database
- Docker Compose orchestration for runtime stack

High-level flow:

1. Frontend calls backend REST endpoints.
2. Backend authenticates and authorizes requests.
3. Backend services execute domain logic and persist via Prisma.
4. Responses return to frontend services/components.

## Backend architecture

### Runtime bootstrap

Entry point: `backend/src/server.ts`

Bootstrap responsibilities:

- initialize Express app
- apply security/logging/parsing middleware
- mount `/api` route tree
- connect Prisma client and start server
- install 404 and error handlers

### Middleware pipeline

Main concerns:

- security headers (`helmet`)
- CORS with configured allowed origins
- request logging (`morgan`)
- JSON/urlencoded parsing
- authentication (`Bearer` token)
- role and resource permission checks
- validation handling
- file upload handling
- centralized error handling

### Route and service layering

Route modules are grouped by domain under `backend/src/routes`.

Typical pattern:

1. route-level validation/auth checks
2. service invocation
3. standardized JSON response

Service modules under `backend/src/services` encapsulate domain logic for:

- auth
- meta-metamodel/metamodel/model/diagram
- transformations
- code generation
- testing
- file storage
- sharing and admin operations

### Persistence

Prisma schema (`backend/prisma/schema.prisma`) defines core tables and enums.

Modeling payloads are stored in JSON-heavy columns for flexibility, while ownership and key relations remain relational.

## Frontend architecture

### App composition

Main app shell: `frontend/src/App.tsx`

Responsibilities:

- route composition
- top-level navigation
- feature page wiring (metamodel/model/diagram/transformation/codegen/testing/admin)
- mode switches (for example 2D/3D diagram editor)

### Authentication and role-aware UI

Auth context: `frontend/src/contexts/AuthContext.tsx`

Responsibilities:

- login/register/logout state
- token verification and unauthorized handling
- role hierarchy and operation checks
- service cache reset/reinitialize on auth transitions

### Service layer

Frontend services under `frontend/src/services` provide:

- API client abstraction
- in-memory orchestration and caching
- synchronization with backend endpoints
- feature-specific operations for each domain

This keeps component code focused on interaction and presentation.

### Editor-heavy feature modules

Major interactive domains:

- metamodel visual editor and constraint tooling
- model visual editor with validation and appearance control
- 2D/3D diagram editors
- transformation rule/execution dashboard
- code generation project/template workspace

## Shared contracts

`shared/types/index.ts` defines common type contracts used by both backend and frontend.

Key shared categories:

- user roles and sharing types
- metamodel/model/diagram structures
- transformation and codegen entities
- testing and file metadata types

Using shared contracts helps reduce drift across client/server boundaries.

## Deployment topology

Defined in `docker-compose.yml`:

- `db`: PostgreSQL
- `backend`: Node/Express + Prisma migrations on startup
- `frontend`: Nginx serving React build

Port mapping:

- frontend: host `3000` -> container `80`
- backend: host `3002` -> container `3001`

Frontend Nginx proxies `/api/*` to backend service inside Compose network.

## Request lifecycle examples

### Example: create metamodel

1. UI action in metamodel editor triggers frontend service call.
2. API client sends `POST /api/metamodels` with bearer token.
3. backend auth middleware resolves user + role.
4. metamodel service validates role and references.
5. Prisma persists row and response is returned.
6. frontend updates local state/cache.

### Example: share diagram

1. UI opens share dialog and submits email + permission.
2. API client calls `POST /api/share/DIAGRAM/:id/share`.
3. backend verifies sharer role and ownership.
4. sharing service writes share row and applies cascade rules.
5. response includes cascaded shares and warnings.

## Architecture characteristics

- modular domain service boundaries
- JSON-flexible modeling payload strategy
- role + ownership + share-permission security model
- frontend feature isolation with shared API client patterns
- containerized runtime path aligned with local development

## Related docs

- [API Reference](api.md)
- [Data Model](data-model.md)
- [Docker Setup](../getting-started/docker-setup.md)
