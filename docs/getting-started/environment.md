# Environment Configuration

This page is the source of truth for runtime variables used by local and Docker setups.

## Environment files in this repository

- Root Docker example: `.env.docker.example`
- Backend development example: `backend/.env.example`
- Backend production example: `backend/.env.production.example`

## Backend variables

Defined and consumed by backend configuration.

### Required in all environments

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string for Prisma | `postgresql://postgres:password@localhost:5432/modeling_tool?schema=public` |

### Required in production

| Variable | Purpose | Constraint |
|---|---|---|
| `JWT_SECRET` | JWT signing secret | Must be set and at least 32 characters |
| `CORS_ORIGIN` | Allowed frontend origins | Must not include `localhost`, `127.0.0.1`, or `*` |

### Optional with defaults

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3001` | Backend HTTP port |
| `NODE_ENV` | `development` | Used for runtime mode and validation behavior |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated list supported |
| `MAX_FILE_SIZE` | `52428800` | 50 MB upload/body limit |
| `LOG_LEVEL` | `debug` | Logging verbosity |
| `JWT_EXPIRES_IN` | `7d` | Token expiration |

## Frontend variables

Frontend API base behavior:

- If `REACT_APP_API_URL` is set, frontend uses that value.
- If not set in development, frontend defaults to `http://localhost:3001/api`.
- In production builds, frontend expects `/api` (or explicit secure `https://` absolute URL).

Recommended frontend variable when not using reverse proxy:

| Variable | Purpose | Example |
|---|---|---|
| `REACT_APP_API_URL` | Overrides API base URL | `http://localhost:3001/api` |

## Docker-specific variables (root `.env`)

Used by `docker-compose.yml`:

| Variable | Default in example | Purpose |
|---|---|---|
| `POSTGRES_DB` | `modeling_tool` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `change_this_password` | Database password |
| `JWT_SECRET` | placeholder | Backend JWT secret |

## Security guidance

- Never commit real secrets to source control.
- Use long random strings for `JWT_SECRET`.
- Use production-only domains in `CORS_ORIGIN`.
- Prefer HTTPS API URLs in production frontend deployments.

## Recommended setup recipes

### Local development

1. Copy `backend/.env.example` to `backend/.env`
2. Set `DATABASE_URL`
3. Set `JWT_SECRET`

### Docker development

1. Copy `.env.docker.example` to `.env` (root)
2. Set DB credentials and `JWT_SECRET`
3. Run `docker compose up --build`

## Related docs

- [Local Setup](local-setup.md)
- [Docker Setup](docker-setup.md)
