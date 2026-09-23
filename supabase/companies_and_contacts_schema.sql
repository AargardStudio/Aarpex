-- ============================================================================
-- AarPex -- Companies & Contacts: current live schema (reference + repair)
--
-- This reflects what the companies/contacts tables actually look like today
-- after every migration that's touched them: 0001 (initial create),
-- 0002 (id columns retyped from uuid to text -- the app generates its own
-- string ids like "comp_1758...", never real UUIDs), 0004 (Business Profile
-- fields: ai_analysis / call_log / source_lead_id on companies), and 0007
-- (leads.linked_company_id / linked_contact_id, so "Sync All to
-- Companies/Contacts" actually persists -- see that migration's comment for
-- why it was silently failing before).
--
-- Every statement below is idempotent (IF NOT EXISTS / ADD COLUMN IF NOT
-- EXISTS) -- safe to run against the live database as-is, whether the
-- tables already exist in full or are missing a column from a migration
-- that was never applied. Nothing here drops or renames anything.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- COMPANIES
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id                  text primary key default gen_random_uuid()::text,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  name                text not null,
  logo                text,
  industry            text,
  website             text,
  country             text,
  city                text,
  address             text,
  phone               text,
  email               text,
  primary_contact_id  text,
  salesperson         text,
  status              text not null default 'Prospect',
  customer_value      numeric not null default 0,
  notes               text,
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Business Profile fields (migration 0004)
  ai_analysis         jsonb,
  call_log            jsonb not null default '[]'::jsonb,
  source_lead_id      text
);

-- In case this table pre-dates migration 0002 and still has uuid-typed id
-- columns, bring it in line (no-op if already text).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    alter table public.companies alter column id type text using id::text;
    alter table public.companies alter column id set default gen_random_uuid()::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'companies'
      and column_name = 'primary_contact_id' and data_type = 'uuid'
  ) then
    alter table public.companies alter column primary_contact_id type text using primary_contact_id::text;
  end if;
end $$;

create index if not exists idx_companies_tenant on public.companies(tenant_id);

alter table public.companies enable row level security;

drop policy if exists companies_all on public.companies;
create policy companies_all on public.companies for all
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- CONTACTS
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id           text primary key default gen_random_uuid()::text,
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  first_name   text not null,
  last_name    text,
  position     text,
  company_id   text references public.companies(id) on delete set null,
  email        text,
  phone        text,
  whatsapp     text,
  linkedin     text,
  country      text,
  city         text,
  status       text,
  lead_source  text,
  salesperson  text,
  notes        text,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    alter table public.contacts alter column id type text using id::text;
    alter table public.contacts alter column id set default gen_random_uuid()::text;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contacts'
      and column_name = 'company_id' and data_type = 'uuid'
  ) then
    alter table public.contacts alter column company_id type text using company_id::text;
  end if;
end $$;

create index if not exists idx_contacts_tenant on public.contacts(tenant_id);
create index if not exists idx_contacts_company on public.contacts(company_id);

alter table public.contacts enable row level security;

drop policy if exists contacts_all on public.contacts;
create policy contacts_all on public.contacts for all
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- LEADS -> COMPANIES/CONTACTS linkage columns (migration 0007)
-- The actual fix for "Sync All to Companies/Contacts" not persisting: the
-- app has written linkedCompanyId/linkedContactId onto synced Leads since
-- v1.11.0, but these columns never existed here, so every leads upsert that
-- included them was rejected outright by Postgres -- silently, in the
-- browser console only -- which meant leads stopped syncing to Supabase at
-- all (not just the linkage) from that point on for any tenant that ran a
-- sync. This section is what actually fixes it; run it even if you only
-- meant to inspect Companies/Contacts.
-- ----------------------------------------------------------------------------
alter table public.leads
  add column if not exists linked_company_id  text references public.companies(id) on delete set null,
  add column if not exists linked_contact_id  text references public.contacts(id)  on delete set null;

create index if not exists idx_leads_linked_company on public.leads(linked_company_id);
create index if not exists idx_leads_linked_contact  on public.leads(linked_contact_id);
