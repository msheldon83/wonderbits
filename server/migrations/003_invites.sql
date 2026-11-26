-- An invite the owner has stopped: nobody new can sign up with it. Families
-- who already used it are not affected.
alter table invites add column stopped_at timestamptz;
