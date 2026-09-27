-- ============================================================================
-- Industry Agents (replaces Industry Playbooks) -- renames the existing
-- industry_playbooks table in place (zero data loss: `rename to` keeps
-- every existing row, id, and foreign-key reference intact) and adds the
-- new fields required by the Industry Agents build spec:
--   - model_provider / model_name: which AI provider/model drafts this
--     agent's messages. One platform-wide API key per provider
--     (GEMINI_API_KEY / OPENAI_API_KEY in server.ts) is shared by every
--     tenant -- there is no per-tenant credential to store.
--   - frequency_minutes: how often (in minutes, 15 minimum) this agent's
--     scan should run once auto-run is on.
--   - last_scan_at: when this agent's scan last actually ran.
--   - negotiation_guidance is renamed to negotiation_conditions (same
--     column, same data, clearer name matching src/types.ts).
--
-- Safe to re-run.
-- ============================================================================

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'industry_playbooks')
     and not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'industry_agents') then
    alter table public.industry_playbooks rename to industry_agents;
  end if;
end $$;

-- In case this is a fresh project that never had 0012/0013 applied (or this
-- migration is re-run after the rename already happened), make sure the
-- table exists under its new name with the full up-to-date shape.
create table if not exists public.industry_agents (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references public.tenants(id) on delete cascade,
  industry                text not null,
  is_active               boolean not null default true,
  tone                    text,
  talking_points          text[] not null default '{}',
  pain_points             text[] not null default '{}',
  objection_notes         text,
  qualification_guidance  text,
  preferred_channel       text not null default 'Email',
  follow_up_frequency_days integer not null default 7,
  follow_up_count         integer not null default 2,
  auto_run_enabled        boolean not null default false,
  max_discount_percent    numeric not null default 0,
  created_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.industry_agents
  add column if not exists negotiation_guidance text,
  add column if not exists model_provider text not null default 'gemini',
  add column if not exists model_name text not null default 'gemini-3.1-flash-lite',
  add column if not exists frequency_minutes integer not null default 15,
  add column if not exists last_scan_at timestamptz;

-- Rename negotiation_guidance -> negotiation_conditions (same column/data).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'industry_agents' and column_name = 'negotiation_guidance'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'industry_agents' and column_name = 'negotiation_conditions'
  ) then
    alter table public.industry_agents rename column negotiation_guidance to negotiation_conditions;
  end if;
end $$;

alter table public.industry_agents
  add column if not exists negotiation_conditions text;

-- Enforce the confirmed 15-minute floor going forward (existing rows below
-- it, if any ever existed, are bumped up rather than left invalid).
update public.industry_agents set frequency_minutes = 15 where frequency_minutes < 15;
alter table public.industry_agents
  drop constraint if exists industry_agents_frequency_minutes_floor,
  add constraint industry_agents_frequency_minutes_floor check (frequency_minutes >= 15);

drop index if exists idx_industry_playbooks_tenant;
create index if not exists idx_industry_agents_tenant on public.industry_agents(tenant_id);

alter table public.industry_agents enable row level security;

drop policy if exists industry_playbooks_all on public.industry_agents;
drop policy if exists industry_agents_all on public.industry_agents;
create policy industry_agents_all on public.industry_agents
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
