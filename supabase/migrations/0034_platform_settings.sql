-- Platform-wide encrypted settings (e.g. the Microsoft OAuth app credentials
-- used for "Sign in with Microsoft"). Server-only: RLS on, no policies.
create table if not exists public.platform_settings (
  key text primary key,
  value_enc text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.platform_settings enable row level security;
