# Local Setup

Run backend and frontend directly on your machine (without Docker).

## Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm
- PostgreSQL 16+ (or any PostgreSQL compatible with Prisma configuration)

## 1) Prepare the repository

From the repository root, install dependencies in both apps.

```bash
cd backend
npm ci

cd ../frontend
npm ci
```

## 2) Configure backend environment

Create a backend env file from the provided example:

```bash
cd backend
copy .env.example .env
```

If you are not on Windows, use:

```bash
cp .env.example .env
```

Update at least these values in `backend/.env`:

- `DATABASE_URL`
- `JWT_SECRET` (set a long random value)

See [Environment Configuration](environment.md) for all variables.

## 3) Create database schema

From `backend/`, run Prisma migration in development mode:

```bash
npm run prisma:migrate
```

This applies migrations and generates Prisma client artifacts.

## 4) Start backend

From `backend/`:

```bash
npm run dev
```

Expected API base URL:

- `http://localhost:3001/api`

Quick health check:

- `http://localhost:3001/api/health`

## 5) Start frontend

In a second terminal, from `frontend/`:

```bash
npm start
```

Expected app URL:

- `http://localhost:3000`

In development, frontend API calls default to `http://localhost:3001/api`.

## 6) Verify first run

- Open `http://localhost:3000`
- Register a user from the login page
- Confirm authenticated requests succeed (no CORS errors)

## Common issues

### Database connection errors

- Confirm PostgreSQL is running
- Confirm `DATABASE_URL` credentials and database name are valid
- Re-run `npm run prisma:migrate` in `backend/`

### Frontend cannot reach backend

- Confirm backend is listening on `3001`
- Confirm `CORS_ORIGIN` in `backend/.env` includes `http://localhost:3000`

### Prisma/client mismatch

From `backend/` run:

```bash
npm run prisma:generate
```

## Related docs

- [Environment Configuration](environment.md)
- [Docker Setup](docker-setup.md)
- [Architecture](../reference/architecture.md)
