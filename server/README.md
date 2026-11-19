# Wonderbits server

Accounts, sync and family sharing for Wonderbits. It is optional: the game
runs without it, and a build without `VITE_ACCOUNTS=1` never talks to it.
The design is in [docs/accounts-plan.md](../docs/accounts-plan.md).

It is a small Node server (Hono) over Postgres. In production the same
server also serves the built game, so the game and the API share one origin.

## Run it locally

```bash
docker compose up -d db
```

```bash
cd server && npm install
```

```bash
DATABASE_URL=postgres://wonderbits:wonderbits@localhost:5432/wonderbits npm run dev
```

The server applies any new migrations when it starts. `GET /api/health`
answers `{"ok":true}` when it can reach the database.

## Tests

The tests use a real Postgres and empty the database they are given, so
they have their own: `wonderbits_test`, which `docker compose` creates.
Set `TEST_DATABASE_URL` to use another.

```bash
npm test
```

## Settings

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | Any Postgres 13 or newer. Required. |
| `PORT` | Port to listen on. Default 8080. |
| `STATIC_DIR` | A built copy of the game to serve. The Docker image sets it. |

## The whole app in one container

```bash
docker compose --profile app up --build
```

Then open http://localhost:8080.
