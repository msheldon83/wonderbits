# Wonderbits feedback loops: attempts, ratings, notes and questions

## Context

Accounts and sync are merged. The server now knows who is playing, but it only stores each child's totals (stars, attempts count, best steps). The detailed record of what a child did stays on the device in the observation log, and that log never holds the program a child actually ran. So there is no way to see, across children, which levels trip them up or what mistake they make there, and no way for a child to say "this is confusing" or ask a question.

This plan adds that: a record of each attempt, a difficulty rating and optional note when a level is finished, a way to send feedback or a question at any time, and a page where the owner reads it all.

Decisions made with the owner:

- **Owner's view:** an admin page in the app, plus an email when feedback arrives.
- **Replies to questions:** go to the grown-up (email and their page), never straight to the child.
- **Permission:** on by default under an updated notice; a grown-up can turn it off.
- **Extras included:** a "stuck?" nudge, reasons for quitting a level, feedback from grown-ups, and grouping of common wrong answers.

## Principles

1. **Only signed-in children with permission.** Guests and builds without `VITE_ACCOUNTS=1` send nothing, as now.
2. **The grown-up sees what their child sends** and can delete it or turn collection off.
3. **The owner sees patterns, not people.** The admin page shows a short made-up id per child, never a nickname or email.
4. **Never in the way of play.** Every prompt is optional, one tap to answer or ignore, and nothing waits on the network.

## What is recorded

### Attempts and visits

One **visit** per time a child opens a level, and one **attempt** per run inside it.

| Table | Columns (main) |
| --- | --- |
| `level_visits` | `id` (made on the device), `child_id`, `level_id`, `app_version`, `opened_at`, `ended_at`, `ended` (`completed` / `left`), `runs`, `hints_opened`, `active_ms`, `stars`, `difficulty` (1 to 3, null if not rated), `stuck` (null / `fine` / `a-bit` / `very`) |
| `attempts` | `visit_id`, `seq`, `at`, `program jsonb`, `program_hash`, `cards`, `outcome` (`solved` / `blocked` / `halted` / `missed`), `detail jsonb` (block reason and cell, or halt reason), `ms_since_open`, `edits_since_last_run`, `hint_rung`, `prediction_correct` |

- `program_hash` is a hash of the program with ids stripped, so identical wrong answers group together.
- A visit that ends `left` keeps its last attempt, which is the "quit reason": what the child's final try did, after how many runs and how long.
- `app_version` is the build's commit, so results can be tied to the level as it was then.
- Made-here creations and the Workshop are left out for now: levels in the packs only.

### Feedback

| Table | Columns (main) |
| --- | --- |
| `feedback` | `id`, `parent_id`, `child_id` (null when the grown-up wrote it), `kind` (`level-note` / `confusing` / `problem` / `idea` / `question` / `stuck`), `text`, `context jsonb` (screen, level, visit, the program on screen, app version), `created_at`, `read_at`, `reply`, `replied_at` |

- Text is capped at 500 characters, stored as plain text, and has email addresses and long digit runs blanked before it is saved.
- At most 100 notes a day per child: far more than a long session of levels with a note on each, and only there to stop a runaway. Difficulty ratings and "stuck" answers are stored on the visit and do not count.

### Permission and privacy

- **Notice:** `src/account/PrivacyScreen.tsx` changes: the line "No record of every tap" becomes an honest account of what is now sent (each program a child runs and how it went, ratings, and anything they choose to write), who reads it (the person who runs this copy), and how to turn it off. `CONSENT_VERSION` in `server/src/family.ts` is raised.
- **Switch:** `parents.improve` (default true) with a toggle "Help improve Wonderbits" on the grown-up's page. Off means nothing in this plan is sent and the prompts are hidden.
- **No re-consent step.** No real family has signed up yet, so the notice is simply replaced and every family starts under the new one. If the notice changes again after launch, asking existing families to agree is work for then.
- **Transparency:** the grown-up's page lists what each child wrote, with a delete button. "Download everything kept" includes visits, attempts and feedback. Deleting a child deletes all of it.
- **Retention:** attempts and visits older than 12 months are deleted by the server on start-up.

Note for the owner: free text from a child is the most sensitive thing this project will hold. Having it on by default rests on the grown-up having agreed to a notice that says so plainly. As before, this is not legal advice; have the notice reviewed before a public launch.

## In the game

### Capturing attempts

- `src/app/PlaySurface.tsx` gains an optional `onAttempt({ program, outcome })` callback, fired where a run ends (it already knows the program and the outcome at the `trace-halted` and `onSolved` call sites). No change to the local observation log.
- New `src/insight/recorder.ts`: builds visit and attempt records from `onAttempt`, hint openings and the open/leave/complete moments `src/app/Lesson.tsx` already has.
- New `src/insight/outbox.ts`: records wait in the child's own storage (`insight:outbox`, capped at 500) and are sent in batches to `POST /api/insight/batch` on the same schedule sync already runs (`ChildGame` in `src/account/Root.tsx`). Offline, they wait.

### When a level is finished

In the completion dialog (`src/app/Lesson.tsx`), under the stars:

- "How was that one?" with three faces: **Easy**, **Just right**, **Hard**. One tap, optional.
- A quiet "Tell us something" link that opens a short text box.
- "Next level" works at once whether or not either is used.

### At any time

- A speech-bubble button in the header (`src/app/App.tsx`), on the map, in a level and in Create.
- It opens a small dialog: four choices (**This is confusing**, **Something is broken**, **I have an idea**, **I have a question**), a text box, **Send**.
- It says who reads it: "This goes to the people who make Wonderbits. Your grown-up can see it too. Don't write your name or where you live."
- The level and the program on screen are attached automatically, so "this is confusing" arrives with what the child was looking at.
- After a question: "We'll send the answer to your grown-up."

### The "stuck?" nudge

- Once per visit, after 5 runs that did not solve it or 4 minutes of activity, a small banner (not a dialog): "Is this one tricky?" with **I'm fine**, **A bit**, **Very**.
- **A bit** or **Very** offers three one-tap reasons ("I don't know what to do", "I don't know which card to use", "My program does something odd") and a text box, and points at the hint button.
- The answer is stored on the visit, so levels can be ranked by how often children say they are stuck, including children who then quit.

### On the grown-up's page

`src/account/GrownupScreen.tsx` gains:

- The "Help improve Wonderbits" switch.
- Under each child: what they sent, any reply, and delete.
- A feedback box of their own ("What do you see your child struggle with?").

## The owner's page

- **Who is the owner:** a parent account whose email is listed in a new `ADMIN_EMAILS` server setting. Every `/api/admin/*` route checks it; the page is `#/admin`.
- **Levels table:** one row per level, sortable: children who started it, share who finished, typical runs and time to solve, share who opened a hint, share who left unfinished, average difficulty rating, share who said they were stuck. The worst levels float to the top.
- **One level:** how runs ended (blocked by a wall, ran out of steps, missed the flag), the commonest wrong programs with how many children ran each, shown as cards and as code using the existing projection in `src/projection/`, quit reasons, and every note written on that level.
- **Inbox:** all feedback, newest first, filtered by kind and unread. A reply box on questions; sending it emails the grown-up and shows on their page. The owner never sees the address.
- **Email to the owner:** new feedback is mailed to `ADMIN_EMAILS`, at most one message every 15 minutes, listing what arrived.
- **Download:** visits, attempts and feedback as CSV for analysis elsewhere, with the made-up child id.

## Server

- `server/migrations/002_insight.sql`: the three tables and `parents.improve`.
- New `server/src/insight.ts`: `POST /api/insight/batch` (child session; idempotent on visit id and seq; size-capped), `POST /api/feedback` (child or parent), parent routes to list and delete a child's feedback.
- New `server/src/admin.ts`: `requireAdmin`, the level summary query, level detail, inbox, reply, CSV export.
- `GET /api/device` also returns whether collection is on, so the game knows whether to record and prompt.
- Reuses `requireChild`, `requireParent`, `Refusal`, `readJson` and the `Mailer` already in `server/src/`.

## Build order

Work on a fresh branch from `main`, in a worktree as before. Each step leaves `main` working.

1. **Plan and permission.** Save this as `docs/feedback-plan.md`; update the notice, consent version and the switch.
2. **Capture.** `onAttempt`, recorder, outbox, batch endpoint, tables, retention.
3. **Level-complete rating and note.**
4. **Feedback at any time**, the grown-up's feedback box, and the grown-up's view of what a child sent.
5. **"Stuck?" nudge and quit reasons.**
6. **Owner's page:** levels table, level detail with common wrong programs, inbox, replies, email, download.
7. **End-to-end check** extended, docs updated.

## Left out on purpose

- Recording inside Create, the Workshop and made-here puzzles.
- Replies shown directly to a child.
- Charts over time, cohorts, or A/B comparison of level versions.
- Any third-party analytics.

## Verification

- **Unit (game):** the recorder turns a sequence of runs, hints and a completion into the right visit and attempts; the outbox survives a restart, caps itself, and sends nothing when collection is off or nobody is signed in; the nudge fires once at the thresholds.
- **Server (real Postgres):**
  - A batch is stored once even if sent twice; one child cannot write to another's visit.
  - Nothing is accepted when `improve` is off.
  - Feedback text is capped and has emails and digit runs blanked; the daily limit holds.
  - Admin routes refuse a parent who is not in `ADMIN_EMAILS`, and never return a nickname or email.
  - A reply mails the right grown-up; deleting a child removes their visits, attempts and feedback; old attempts are pruned.
  - The level summary and common-wrong-answer grouping return the right numbers for a seeded set.
- **End to end (extend `e2e/accounts.mjs`):** a child fails a level twice with the same program, solves it, rates it Hard and writes a note; sends a question from the header; the owner sees the level's numbers, the grouped wrong program, the note and the question, and replies; the grown-up sees the reply and the mail is sent; the grown-up turns collection off and the prompts disappear.
- **Regression:** `e2e/no-accounts.mjs` still shows no prompts and no server calls; typecheck, both test suites and both builds pass.
