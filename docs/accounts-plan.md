# Wonderbits accounts, sync and family sharing: plan

## Context

Wonderbits is local-first today: no server, no accounts, one implicit child per device, everything in IndexedDB (`src/progress/storage.ts`). The docs defer accounts on purpose ("later releases add accounts if the project goes public", `docs/plan.md:433`) and no design for them exists. To share the app beyond one nephew, it needs a server for accounts and progress, and because the players are 9 to 12, a grown-up must create and control every child profile.

Decisions made with the owner:

- **Scope v1:** parent accounts, child profiles, progress and creations synced across devices, a basic parent dashboard, and sharing creations inside one family (child to sibling, child to parent).
- **Audience:** friends and family, invite-only.
- **Child sign-in:** a parent must authorize the device first. On an authorized device the child picks their profile and enters a PIN. A nickname and PIN alone never open an account.
- **Hosting:** Fly.io with Postgres, no PaaS lock-in. Everything must run from one Docker image against any Postgres so others can self-host.

## Principles

1. **The app still works with no server.** Accounts are an optional layer; a build without `VITE_ACCOUNTS=1` behaves exactly as today (this is what GitHub Pages keeps serving).
2. **Local-first stays.** IndexedDB remains the source the UI reads; sync runs in the background and the game is playable offline.
3. **Collect as little as possible about children.** No child email, real name, birthdate or free-text profile. The observation log and device settings stay on the device.
4. **A child cannot exist without a parent,** and a device cannot reach a family without that parent's approval.
5. **Nothing a child makes leaves the family.** Sharing is only between profiles under the same parent account.

## Architecture

- **One Fly app serves both the built frontend and `/api`.** Same origin means plain httpOnly cookies work (no CORS, no Safari third-party-cookie trouble), and self-hosters get a single container.
- **Server:** Node 22 + TypeScript in a new `server/` npm workspace. Hono for HTTP, `postgres` (postgres.js) with plain SQL migration files, `@node-rs/argon2` for PIN hashing, `nodemailer` over SMTP for email (any provider).
- **Database:** Postgres. On Fly, a new database on the existing cluster via `fly postgres attach`, or its own; only `DATABASE_URL` matters.
- **Config (env):** `DATABASE_URL`, `SESSION_SECRET`, `SMTP_URL`, `MAIL_FROM`, `PUBLIC_URL`, `INVITE_REQUIRED` (default true).

### Data model

| Table | Columns (main) |
| --- | --- |
| `invites` | `code`, `created_at`, `used_by`, `used_at`, `max_uses` |
| `parents` | `id`, `email` (unique, lower-cased), `created_at`, `notify_by_email` |
| `login_tokens` | `token_hash`, `parent_id` or pending `email` + `invite_code`, `expires_at`, `used_at` |
| `children` | `id`, `parent_id`, `nickname` (unique within the family), `pin_hash`, `avatar` (from a fixed set), `created_at`, `last_active_at`, `consent_version`, `consented_at` |
| `devices` | `id`, `parent_id`, `name`, `token_hash`, `created_at`, `last_seen_at`, `revoked_at` |
| `device_pairings` | `code`, `pending_token_hash`, `expires_at`, `approved_by`, `device_id` |
| `sessions` | `token_hash`, `kind` (`parent` / `child`), `parent_id` / `child_id`, `device_id`, `expires_at` |
| `pin_attempts` | `device_id`, `child_id`, `at` (for throttling) |
| `documents` | `child_id`, `key`, `value jsonb`, `rev bigint`, `deleted bool`, `updated_at`; primary key `(child_id, key)` |
| `shares` | `id`, `parent_id`, `from_child_id`, `to_child_id` (null means "to the grown-up"), `creation jsonb` (a snapshot taken when sent), `created_at`, `seen_at` |

Deleting a child or parent cascades to everything under it.

### Parent permission model

- **Parent sign-up:** invite code + email, then a one-time magic link (15 minutes, single use, stored hashed). No passwords.
- **Creating a child:** the parent picks a nickname, an avatar and a PIN, reads a short plain-language notice of what is stored, and ticks a consent box. The server records `consent_version` and `consented_at`. The form warns against using the child's real name.
- **Authorizing a device** (required before any child can sign in on it), two ways:
  - The parent signs in on that device with a magic link and taps "Set up this device for my kids".
  - The device shows a short pairing code (10 minutes, single use); the parent enters it in their dashboard from their own phone or computer.
  
  Either way the device receives a long-lived device token in an httpOnly cookie, tied to that one family.
- **Child sign-in:** an authorized device lists that family's profiles. The child taps theirs and enters the PIN. The server requires a valid device token **and** the PIN, so the PIN only separates siblings; a stranger with a nickname and PIN but no authorized device gets nothing, and nicknames are never looked up globally.
- **PIN protection:** 4 to 6 digits, argon2 hashed, throttled per device and child with growing delays. The parent can reset it.
- **Child session limits:** read and write that child's documents, send and receive family shares. It cannot see the parent's email, change PINs, manage devices or delete anything on the account.
- **Revoking:** the parent can remove a device (ends its sessions at once) or sign a child out everywhere.

Note for the owner: for an invite-only app that shares nothing outside the family, email-verified parental consent is the usual light-weight approach under COPPA, but this plan is not legal advice. A public launch should get the privacy notice and consent method reviewed first.

### Parent dashboard (basic)

A `#/grownup` area in the same app, parent session only. It reads the data sync already stores, so it needs no extra collection from the child.

- **Per child:** last active, levels finished per pack, stars and badges, list of creations (open any to play it).
- **From the kids:** creations a child sent with "Show my grown-up", newest first, with unseen ones marked.
- **Family activity:** what siblings have sent each other.
- **Manage:** add a child, reset a PIN, authorize or remove devices, download a child's data as JSON, delete a child, delete the account, turn email notices on or off.

The detailed observation log stays on the child's device and keeps its existing manual export.

### Family sharing

- **Send to a sibling.** From a proved creation, the child picks a sibling's avatar. The server stores a snapshot in `shares`. The sibling sees it on their shelf under "From <nickname>" and can play it or remix it through the existing remix flow (`basedOn` records where it came from).
- **Show my grown-up.** Any creation, proved or draft. It lands in the parent dashboard. If `notify_by_email` is on, the parent gets a short email saying a creation is waiting (nickname and title only, with a link to sign in).
- **Limits:** recipients can only be profiles under the same parent, enforced on the server. No free-text messages, only the creation itself. A daily cap per child keeps it from becoming spam.
- **Oversight:** the parent sees every share and can delete any of them. A family setting can turn sibling sharing off.

### Sync

Documents are stored per child under the same keys the client already uses:

| Key | Synced | Merge rule |
| --- | --- | --- |
| `progress` | yes | Field-wise, never loses work: stars OR-ed, `bestSteps` min, `attempts` max, predictions max, `badges` and `introsSeen` unioned, then `computeBadges` re-run |
| `creation:<id>` | yes | The newer copy wins (`updatedAt`, or the proof's date if later); deletes are tombstones |
| `drafts` | yes | Per level; the device in the child's hands wins (saved places carry no dates) |
| `settings` | no | Device preference |
| `log` | no | Stays on the device |

API:

- `GET /api/sync?since=<rev>` returns documents changed after `rev`, plus new shares.
- `PUT /api/sync/:key` with `baseRev`; the server answers `409` with the current document if `baseRev` is stale. The client merges and retries.
- Size limits per document and a cap on creations per child.

### Client changes

- **Profile-scoped storage.** Add `scopedStore(store, prefix)` in `src/progress/storage.ts` wrapping `KeyValueStore`, so each child's keys live under `p:<childId>:`. Existing un-prefixed data is the device's "guest" data.
- **Store lifetime.** `App.tsx:29-40` creates `ProgressStore` and `CreationStore` once. Move that into a provider keyed on the active profile so switching child rebuilds both stores.
- **New module `src/sync/`:**
  - `protocol.ts`: request and response types shared with the server.
  - `merge.ts`: the pure merge functions above (unit-tested).
  - `engine.ts`: marks keys dirty on write, pushes when online, pulls on start and on focus, retries with backoff.
  - `api.ts`: the only place `fetch` appears.
- **New module `src/account/`:**
  - Device setup (pairing code, or parent sign-in), profile picker and PIN pad.
  - Parent sign-up and sign-in, the dashboard, add-child with consent, devices list.
  - Privacy notice page.
  - New routes in `src/app/levels.ts`: `#/who`, `#/pair`, `#/grownup`, `#/privacy`.
- **Sharing UI in `src/create/`:** "Send to..." and "Show my grown-up" on a creation, and a "From my family" section on the shelf.
- **First sign-in on a device with guest progress:** ask the parent once whether to bring this device's progress into a child's profile (merged with the rules above).
- **`Creation.madeBy`** (`src/create/types.ts:37`) is set from the child's nickname when signed in.
- **Grown-up section of `src/app/SettingsScreen.tsx`:** when accounts are on, account actions move to `#/grownup` behind a parent session. Today that section has no gate at all.

## Build order

Each step is a separate PR that leaves `main` working.

1. **Docs.** Add `docs/accounts-plan.md` (this plan) and update the "no server, no accounts" lines in `docs/plan.md` and `docs/creation-plan.md` to point at it. Fix the age mismatch in `package.json:5`.
2. **Profile-scoped storage and merge functions.** Client only, no behaviour change.
3. **Server skeleton.** `server/` workspace, migrations, health check, Dockerfile that also serves the built frontend, `docker-compose.yml` for local Postgres, CI job with a Postgres service.
4. **Parent accounts.** Invites, magic-link sign-in, sessions, an `npm run invite` script to mint codes.
5. **Children and devices.** Create a child with consent, device authorization (both ways), profile picker + PIN, throttling, revoke.
6. **Sync.** Server endpoints, client engine, guest-progress import.
7. **Parent dashboard.** Progress summary, creations, manage children and devices, export, delete.
8. **Family sharing.** Send to sibling, show my grown-up, shelf inbox, email notice.
9. **Privacy notice and polish.**
10. **Deploy.** `fly.toml`, secrets, attach Postgres, deploy workflow. GitHub Pages keeps the accountless build.

Steps 2 and 3 can go in parallel. The owner needs to supply: the Fly app and Postgres attachment, an SMTP provider, and a `FLY_API_TOKEN` secret for the deploy workflow.

## Left out of v1 on purpose

- Syncing the detailed observation log to the server.
- Sharing outside the family, a gallery, and the moderation those would need.
- Free-text messages between children.
- Public sign-up, schools and classrooms, non-US consent rules.
- A service worker (installable offline play is separate work).

## Verification

- **Unit:** `src/sync/merge.test.ts` covers every merge rule, including two devices solving different levels offline.
- **Server** (Vitest against a real Postgres, CI service container):
  - Sign-up needs a valid invite; magic links expire and are single-use.
  - A correct nickname and PIN from an unauthorized device is refused; a revoked device loses its sessions.
  - Pairing codes expire and work once.
  - A child session cannot read another child's documents or any parent route.
  - A share to a child in another family is refused.
  - PIN throttling kicks in; deleting a child removes its documents and shares; a stale `baseRev` returns 409.
- **End to end (Playwright, already installed)** with `docker compose up`:
  - A parent signs up through a captured email link and creates two children.
  - A second browser context pairs with a code, a child signs in, solves a level, and the dashboard shows it.
  - That child sends a creation to the sibling; the sibling sees it and remixes it. "Show my grown-up" appears in the dashboard.
  - The parent removes the device and that context is signed out.
- **Regression:** `npm run typecheck`, `npm test` and `npm run build` pass with and without `VITE_ACCOUNTS`; the accountless build makes no network requests.
