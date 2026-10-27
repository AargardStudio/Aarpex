-- Aargard Connect (AarPex adapter): multi-key public API.
-- All tables have RLS ON with NO policies: only the server (service role)
-- can read or write them, so key hashes never reach the browser.
create table if not exists public.connect_api_keys (
  id               text primary key,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null,
  environment      text not null default 'live',
  key_prefix       text not null,              -- display only, e.g. agc_live_AbCd
  key_hash         text not null unique,       -- sha256 of the full key; the key itself is never stored
  scopes           text[] not null default '{}',
  status           text not null default 'active',   -- active | revoked
  expires_at       timestamptz,
  created_by_id    uuid,
  created_by_name  text,
  created_by_email text,
  created_at       timestamptz not null default now(),
  last_used_at     timestamptz,
  request_count    bigint not null default 0,
  rotated_at       timestamptz,
  revoked_at       timestamptz
);
create index if not exists idx_connect_keys_tenant on public.connect_api_keys(tenant_id, status);
alter table public.connect_api_keys enable row level security;

create table if not exists public.connect_audit_logs (
  id          text primary key,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key_id      text,
  actor       text,
  action      text not null,
  entity      text,
  entity_id   text,
  detail      jsonb,
  request_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists idx_connect_audit_tenant_time on public.connect_audit_logs(tenant_id, created_at desc);
alter table public.connect_audit_logs enable row level security;

create table if not exists public.connect_idempotency (
  key_id       text not null,
  idem_key     text not null,
  request_hash text not null,
  status       int  not null,
  response     jsonb,
  created_at   timestamptz not null default now(),
  primary key (key_id, idem_key)
);
alter table public.connect_idempotency enable row level security;

create table if not exists public.connect_usage_daily (
  key_id    text not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day       date not null,
  requests  bigint not null default 0,
  errors    bigint not null default 0,
  primary key (key_id, day)
);
create index if not exists idx_connect_usage_tenant_day on public.connect_usage_daily(tenant_id, day desc);
alter table public.connect_usage_daily enable row level security;

-- One atomic call per API request.
create or replace function public.connect_usage_bump(p_key text, p_tenant uuid, p_error boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.connect_usage_daily(key_id, tenant_id, day, requests, errors)
  values (p_key, p_tenant, current_date, 1, case when p_error then 1 else 0 end)
  on conflict (key_id, day) do update
    set requests = connect_usage_daily.requests + 1,
        errors   = connect_usage_daily.errors + case when p_error then 1 else 0 end;
  update public.connect_api_keys
     set request_count = request_count + 1, last_used_at = now()
   where id = p_key;
end $$;
revoke all on function public.connect_usage_bump(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.connect_usage_bump(text, uuid, boolean) to service_role;

notify pgrst, 'reload schema';
