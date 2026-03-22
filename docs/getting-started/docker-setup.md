# Docker Setup

Run database, backend, and frontend using the repository Docker Compose stack.

## Prerequisites

- Docker Desktop (or Docker Engine + Compose plugin)
- Ports available on host:
	- `3000` (frontend)
	- `3002` (backend)
	- `5432` (internal to container network unless exposed)

## 1) Create root `.env`

From repository root, create `.env` from the provided example:

```bash
copy .env.docker.example .env
```

If you are not on Windows:

```bash
cp .env.docker.example .env
```

Set at least:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `JWT_SECRET` (minimum 32 characters recommended)

## 2) Build and start all services

From repository root:

```bash
docker compose up --build
```

This starts:

- `db` (PostgreSQL)
- `backend` (Express + Prisma)
- `frontend` (Nginx serving React build)

## 3) Understand service endpoints

- Frontend app: `http://localhost:3000`
- Backend API from host: `http://localhost:3002`

When using the browser app, requests go through frontend Nginx proxy:

- `/api/*` on port `3000` is proxied to backend container `backend:3001`

## 4) Migration behavior in Docker

On backend container startup, command includes:

- `npx prisma migrate deploy`

That means existing migration files are automatically applied before backend starts serving requests.

## 5) Verify stack health

- Open app: `http://localhost:3000`
- Health endpoint via backend host port: `http://localhost:3002/api/health`

## 6) Day-to-day commands

Start in detached mode:

```bash
docker compose up -d
```

View logs:

```bash
docker compose logs -f
```

Restart one service:

```bash
docker compose restart backend
```

Stop and remove containers:

```bash
docker compose down
```

Stop and remove containers + named volumes:

```bash
docker compose down -v
```

## Common issues

### Port already in use

- Stop local processes using `3000` or `3002`
- Or adjust port mappings in `docker-compose.yml`

### Backend fails on startup

- Inspect logs: `docker compose logs backend`
- Check `JWT_SECRET` and DB credentials in root `.env`
- Ensure db is healthy and accepting connections

### Frontend loads but API calls fail

- Confirm backend container is running
- Confirm Nginx proxy route `/api/` is active

## Related docs

- [Environment Configuration](environment.md)
- [Local Setup](local-setup.md)
- [Architecture](../reference/architecture.md)
