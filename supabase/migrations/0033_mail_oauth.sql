-- Microsoft 365 / Outlook mailbox sign-in (OAuth 2.0). Refresh tokens are
-- stored encrypted (AES-256-GCM) and are only ever read by the server with
-- the service-role key. RLS is on with no policies, so the browser can never
-- read them.
create table if not exists public.mail_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mailbox_id text not null,
  provider text not null default 'microsoft',
  account_email text not null,
  refresh_token_enc text not null,
  scope text,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, mailbox_id)
);
alter table public.mail_oauth_connections enable row level security;
