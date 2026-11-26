-- A grown-up without an invite asking the owner for one. Their address is
-- kept so the owner can answer; an answered request is deleted after a month.
create table access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decision text check (decision in ('approved', 'declined')),
  -- The invite made for them when approved.
  invite_code text references invites (code) on delete set null,
  -- When the owner was told by mail. Null until then.
  mailed_at timestamptz,
  check ((decision is null) = (decided_at is null))
);
create index access_requests_waiting on access_requests (created_at) where decision is null;
