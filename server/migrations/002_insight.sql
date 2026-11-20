-- Feedback loops, as laid out in docs/feedback-plan.md: what children tried
-- on each level, how hard they found it, and what they chose to write.

-- "Help improve Wonderbits": on unless the grown-up turns it off.
alter table parents add column improve boolean not null default true;

-- One time a child opened a level. The id is made on the device, so the same
-- visit sent twice is stored once, and a later copy (now finished, now rated)
-- replaces an earlier one.
create table level_visits (
  id uuid primary key,
  child_id uuid not null references children (id) on delete cascade,
  level_id text not null check (char_length(level_id) between 1 and 80),
  app_version text not null default '',
  opened_at timestamptz not null,
  ended_at timestamptz,
  ended text check (ended in ('completed', 'left')),
  runs integer not null default 0 check (runs >= 0),
  hints_opened integer not null default 0 check (hints_opened between 0 and 3),
  -- Time spent doing things, with long pauses left out.
  active_ms integer not null default 0 check (active_ms >= 0),
  stars smallint check (stars between 0 and 3),
  -- 1 easy, 2 just right, 3 hard. Null when the child did not say.
  difficulty smallint check (difficulty between 1 and 3),
  -- The answer to "Is this one tricky?". Null when it was not asked or not answered.
  stuck text check (stuck in ('fine', 'a-bit', 'very')),
  stored_at timestamptz not null default now()
);
create index level_visits_level on level_visits (level_id);
create index level_visits_child on level_visits (child_id);
create index level_visits_opened on level_visits (opened_at);

-- One run inside a visit: the program as it was, and how the run ended.
create table attempts (
  visit_id uuid not null references level_visits (id) on delete cascade,
  seq integer not null check (seq >= 0),
  at timestamptz not null,
  program jsonb,
  -- The same program gives the same hash, whoever built it: this is what groups common wrong answers.
  program_hash text,
  cards integer not null default 0,
  outcome text not null check (outcome in ('solved', 'blocked', 'halted', 'missed')),
  detail jsonb not null default '{}',
  ms_since_open integer not null default 0,
  edits_since_last_run integer not null default 0,
  hint_rung smallint not null default 0,
  prediction_correct boolean,
  primary key (visit_id, seq)
);
create index attempts_hash on attempts (program_hash);

-- Something a child or a grown-up wrote to the people who run this copy.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  -- Null when the grown-up wrote it themselves.
  child_id uuid references children (id) on delete cascade,
  kind text not null check (kind in ('level-note', 'confusing', 'problem', 'idea', 'question', 'stuck')),
  text text not null check (char_length(text) between 1 and 500),
  -- Where they were: the screen, the level, the program in front of them.
  context jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz,
  reply text,
  replied_at timestamptz,
  -- When the owner was told by mail. Null until then.
  mailed_at timestamptz
);
create index feedback_family on feedback (parent_id, created_at);
create index feedback_new on feedback (created_at);
