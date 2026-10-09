-- Founder's Dashboard integration (hub-and-spoke API).
--   integration_connections: one row per connection (API key hash, webhook
--     secret/url, single-use setup token hash). RLS is ON with NO policies,
--     so only the server (service role) can read or write it -- the browser
--     never sees key hashes or the webhook secret.
--   integration_audit: every call that changed data through the API.
--   tenants.integration_changed_at: bumped whenever the API writes data, so
--     an open browser tab knows to refresh its copy.
create table if not exists public.integration_connections (
  id                text primary key,
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  label             text,
  status            text not null default 'pending',   -- pending | connected | revoked
  setup_token_hash  text,
  setup_expires_at  timestamptz,
  api_key_hash      text,
  webhook_secret    text,
  webhook_url       text,
  created_by_id     uuid,
  created_by_name   text,
  created_by_email  text,
  created_at        timestamptz not null default now(),
  connected_at      timestamptz,
  last_verified_at  timestamptz,
  last_used_at      timestamptz,
  revoked_at        timestamptz
);
create index if not exists idx_integration_conn_key on public.integration_connections(api_key_hash);
create index if not exists idx_integration_conn_setup on public.integration_connections(setup_token_hash);
create index if not exists idx_integration_conn_tenant on public.integration_connections(tenant_id);
alter table public.integration_connections enable row level security;

create table if not exists public.integration_audit (
  id             text primary key,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  connection_id  text,
  actor          text,
  action         text not null,
  entity         text,
  entity_id      text,
  detail         jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_integration_audit_tenant_time on public.integration_audit(tenant_id, created_at desc);
alter table public.integration_audit enable row level security;

alter table public.tenants add column if not exists integration_changed_at timestamptz;
notify pgrst, 'reload schema';
