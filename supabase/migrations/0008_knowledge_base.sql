-- ============================================================================
-- Knowledge Base -- free-text reference material (Company / Product & Service
-- / Operator Playbook) that grounds the floating AI chat assistant's
-- answers. Three categories in one table (a `category` column), same
-- pattern as everything else in this app: whole-array mirror-synced from
-- the client, RLS-scoped per tenant. Safe to re-run.
--
-- id is `text` (not `uuid`) to match every other entity table in this app
-- (companies/contacts/leads/etc.) -- see migration 0002's comment for why:
-- the client generates its own ids and a uuid-typed column has bitten this
-- app before when a non-uuid string id was written to one.
-- ============================================================================

create table if not exists public.knowledge_base (
  id          text primary key default gen_random_uuid()::text,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  category    text not null default 'company', -- 'company' | 'product' | 'operator'
  title       text not null,
  content     text not null default '',
  tags        text[] not null default '{}',
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_knowledge_base_tenant on public.knowledge_base(tenant_id);
create index if not exists idx_knowledge_base_category on public.knowledge_base(tenant_id, category);

alter table public.knowledge_base enable row level security;

drop policy if exists knowledge_base_all on public.knowledge_base;
create policy knowledge_base_all on public.knowledge_base
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
