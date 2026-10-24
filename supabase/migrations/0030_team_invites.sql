-- Real team invitations: store a member's custom permissions, display title,
-- and whether they've accepted yet. All nullable/defaulted, so existing rows
-- (owners) are unaffected.
alter table public.tenant_members
  add column if not exists permissions jsonb,
  add column if not exists role_title  text,
  add column if not exists status      text not null default 'active',
  add column if not exists invited_at  timestamptz;
