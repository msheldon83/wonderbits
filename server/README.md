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

To work on the game against it, run the game with accounts on, in another
terminal at the top of the repository. Vite passes `/api` on to the server:

```bash
VITE_ACCOUNTS=1 npm run dev
```

Start the server with `PUBLIC_URL=http://localhost:5173` so the sign-in
links it prints open the game.

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
| `ADMIN_EMAILS` | The addresses of the people who run this copy, separated by commas. Signed in as a grown-up with one of them, you can open the owner's page (`#/admin`), and new feedback is mailed to you. Unset, nobody can. |

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

## How signing in works

- **A grown-up** signs in with a link sent by email. Their page is `#/grownup`.
- **A child's profile** is made by the grown-up, who agrees to the notice at
  `#/privacy`. No profile exists without that.
- **A device** must be let in before any child can use it. Either the
  grown-up signs in on it and chooses "Let my children use this device", or
  the device shows a code (`#/pair`) that the grown-up types on their page.
- **A child** then picks their picture and types their PIN. The PIN only
  tells brothers and sisters apart: the server refuses it from any browser
  that has not been let in, and slows down after three wrong tries.

## Feedback loops

For families who leave "Help improve Wonderbits" on (it is on unless a
grown-up turns it off), the server keeps each level visit and each run inside
it, how hard the child said a level was, and anything they or their grown-up
write. The design is in [docs/feedback-plan.md](../docs/feedback-plan.md).

The owner's page, `#/admin`, shows it: per level, how many children finished
or gave up, how many runs it took, how hard they found it, the wrong programs
several children built, and an inbox of what was written. Children appear
under made-up names such as `K-3fa9c1`. An answer typed there is mailed to
the family's grown-up and shown on their page; it never goes to a child.
Everything can be downloaded as CSV from the same page.

To open it, put your address in `ADMIN_EMAILS` and sign in as a grown-up with
it. Visits and runs are deleted after 12 months.

## End-to-end check

`e2e/accounts.mjs` walks the whole of that in real browsers against a real
server: sign-up, consent, letting a device in, a child signing in, sync,
sharing, the dashboard, taking a device away and deleting a child. It empties
the database it is given, and needs Playwright.

```bash
VITE_ACCOUNTS=1 npx vite build
```

```bash
E2E_DATABASE_URL=postgres://wonderbits:wonderbits@localhost:5432/wonderbits_e2e node e2e/accounts.mjs
```

`e2e/no-accounts.mjs` checks the other half of the promise: a build without
accounts never calls a server.

## Deploying: Fly.io and Neon

The server runs on [Fly.io](https://fly.io) and the database is a free
[Neon](https://neon.com) Postgres. `fly.toml` runs the Dockerfile on one small
machine that sleeps when nobody is playing. Expect about $1 to $4 a month, all
of it the Fly machine. Once, by hand:

1. **Name the app.** Put your app's name in `fly.toml` (`app`, and
   `PUBLIC_URL` as `https://<name>.fly.dev`), then create it:

   ```bash
   fly apps create <name>
   ```

2. **Make the database.** Create a Neon project in the region nearest the Fly
   region you will deploy in. Copy its pooled connection string, make sure it
   ends in `?sslmode=require`, and give it to the app:

   ```bash
   fly secrets set DATABASE_URL='postgresql://user:pass@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require' --app <name>
   ```

   The server creates its tables on first start; there is nothing to set up
   inside Neon.

   The repository also carries a `neon.ts` for Neon's command-line tool
   (`npm i -g neon`). Signed in with `neon login`, `neon deploy` applies it
   to the linked project and `neon connection-string` prints the address to
   use above. This is optional: the web console gives the same string.

3. **Give it somewhere to send mail, and say who runs it.** Without mail
   nobody can sign in, because the links only reach the log.

   ```bash
   fly secrets set SMTP_URL='smtps://user:pass@smtp.example.com' MAIL_FROM='Wonderbits <you@example.com>' ADMIN_EMAILS='you@example.com' --app <name>
   ```

4. **Deploy,** then check it answers `{"ok":true}`:

   ```bash
   fly deploy --build-arg APP_VERSION=$(git rev-parse --short HEAD)
   ```

   ```bash
   curl https://<name>.fly.dev/api/health
   ```

   If either fails, `fly logs --app <name>` says why.

5. **Make the first invite,** then sign up with it at `#/grownup` using an
   address from `ADMIN_EMAILS`, add a child, and look at `#/admin`:

   ```bash
   fly ssh console --app <name> -C "sh -c 'cd /app/server && node --import tsx src/invite.ts'"
   ```

6. **Optional: deploy from GitHub.** Add the output of
   `fly tokens create deploy --app <name>` as a repository secret named
   `FLY_API_TOKEN`. The "Deploy to Fly.io" workflow then deploys when you run
   it.

What to expect:

- **A slow first visit after a quiet spell.** The Fly machine and the Neon
  database both sleep when idle and wake on the next request, which takes a
  few seconds.
- **Neon's free limits:** 1 GB of storage and 100 compute-hours a month,
  counted only while the database is awake. Plenty for a few families.
- **Mail about feedback** is sent only while the machine is awake.
- **Any other Postgres works too.** Only `DATABASE_URL` matters, so a copy
  hosted elsewhere can use whatever Postgres it has. Fly's own Managed
  Postgres starts at about $38 a month, which is why it is not used here.

GitHub Pages keeps serving the game without accounts, as before.
