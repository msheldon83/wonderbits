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
| `PUBLIC_URL` | Where people reach the app, such as `https://wonderbits.example`. Sign-in links point here, and cookies are marked secure when it is https. |
| `SMTP_URL` | Where to send mail, such as `smtps://user:pass@smtp.example.com`. Unset, mail is printed to the log. |
| `MAIL_FROM` | The sender on that mail. |
| `INVITE_REQUIRED` | `false` lets any grown-up sign up. Default: an invite code is needed. |

## Grown-up accounts

A grown-up signs in with a link sent to their email address; there are no
passwords. While the server is invite-only, a new grown-up also needs a code:

```bash
DATABASE_URL=postgres://wonderbits:wonderbits@localhost:5432/wonderbits npm run invite -- --note "who it is for"
```

Add `--uses 5` for a code several families can share.

## The whole app in one container

```bash
docker compose --profile app up --build
```

Then open http://localhost:8080.
