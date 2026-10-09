-- Lead groups ("lists"): named groups of leads/businesses, and Industry Agents
-- that can be deployed to groups. All new columns are nullable (see 0017).
create table if not exists public.lead_groups (
  id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  color text,
  created_at timestamptz not null default now()
);
alter table public.lead_groups enable row level security;
drop policy if exists lead_groups_all on public.lead_groups;
create policy lead_groups_all on public.lead_groups
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
alter table public.leads add column if not exists group_ids jsonb;
alter table public.industry_agents add column if not exists group_ids jsonb;
alter table public.industry_agents add column if not exists groups_only boolean default false;
notify pgrst, 'reload schema';
