-- ============================================================================
-- Industry Playbooks -- configurable, user-defined AI management profiles
-- per industry. One row per industry (freeform, ideally matching the
-- standard picklist in src/data/industries.ts, custom values still work),
-- driving email tone/talking points, lead qualification guidance, and
-- follow-up cadence/channel defaults wherever that industry's records are
-- touched by AI. See IndustryPlaybook in src/types.ts for the exact shape.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.industry_playbooks (
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
  created_by              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_industry_playbooks_tenant on public.industry_playbooks(tenant_id);

alter table public.industry_playbooks enable row level security;

drop policy if exists industry_playbooks_all on public.industry_playbooks;
create policy industry_playbooks_all on public.industry_playbooks
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
