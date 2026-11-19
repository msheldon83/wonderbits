-- The whole first data model, as laid out in docs/accounts-plan.md.
-- Tokens and PINs are only ever stored hashed.

create table parents (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  notify_by_email boolean not null default true,
  sibling_sharing boolean not null default true,
  created_at timestamptz not null default now()
);

-- A grown-up needs one of these to sign up while the app is invite-only.
create table invites (
  code text primary key,
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  note text,
  created_at timestamptz not null default now()
);

-- One-time sign-in links. A link for someone not yet signed up carries the invite it will spend.
create table login_tokens (
  token_hash text primary key,
  email text not null check (email = lower(email)),
  invite_code text references invites (code) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table children (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  avatar text not null,
  pin_hash text not null,
  consent_version text not null,
  consented_at timestamptz not null,
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index children_family_nickname on children (parent_id, lower(nickname));

-- A browser the grown-up has said their children may use.
create table devices (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index devices_parent on devices (parent_id);

-- A device asking to be let in: it shows the code, the grown-up types it into their dashboard.
create table device_pairings (
  code text primary key,
  pending_token_hash text not null unique,
  -- What the device calls itself, offered to the grown-up as its name.
  name text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  kind text not null check (kind in ('parent', 'child')),
  parent_id uuid not null references parents (id) on delete cascade,
  child_id uuid references children (id) on delete cascade,
  device_id uuid references devices (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  -- A child is only ever signed in on a device the grown-up authorized.
  check ((kind = 'child') = (child_id is not null)),
  check (kind <> 'child' or device_id is not null)
);
create index sessions_parent on sessions (parent_id);

create table pin_attempts (
  device_id uuid not null references devices (id) on delete cascade,
  child_id uuid not null references children (id) on delete cascade,
  at timestamptz not null default now()
);
create index pin_attempts_recent on pin_attempts (device_id, child_id, at);

-- Every stored document takes the next number, so a device can ask for "everything after N".
create sequence document_rev;

create table documents (
  child_id uuid not null references children (id) on delete cascade,
  key text not null,
  value jsonb,
  rev bigint not null default nextval('document_rev'),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (child_id, key)
);
create index documents_since on documents (child_id, rev);

-- A creation sent inside the family. No recipient child means it was shown to the grown-up.
create table shares (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references parents (id) on delete cascade,
  from_child_id uuid not null references children (id) on delete cascade,
  to_child_id uuid references children (id) on delete cascade,
  creation jsonb not null,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (to_child_id is null or to_child_id <> from_child_id)
);
create index shares_to_child on shares (to_child_id, created_at);
create index shares_family on shares (parent_id, created_at);
