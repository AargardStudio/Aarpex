-- ============================================================================
-- AarPex CRM — core multi-tenant schema + row-level security
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- for the AarPex project. Safe to re-run: every statement is idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- TENANTS  (one row per workspace/company account)
-- ----------------------------------------------------------------------------
create table if not exists public.tenants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text not null,
  logo                  text,
  industry              text,
  currency              text not null default 'USD',
  owner_email           text not null,
  plan                  text not null default 'Growth',
  subscription_status   text,
  billing_cycle         text,
  subscription_price    numeric,
  next_billing_date     timestamptz,
  subscription_id       text,
  card_last4            text,
  card_brand            text,
  seats_allocated       integer,
  company_name          text not null default '',
  tax_id                text not null default '',
  commission_rate       numeric not null default 10,
  stripe_config         jsonb not null default '{"isEnabled":false,"publishableKey":"","secretKey":"","currency":"USD","isLiveMode":false,"status":"unconfigured"}'::jsonb,
  webmail_config         jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TENANT MEMBERS  (who belongs to which workspace, and their role)
-- ----------------------------------------------------------------------------
create table if not exists public.tenant_members (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null,
  role        text not null default 'sales_rep',
  joined_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists idx_tenant_members_user on public.tenant_members(user_id);

-- ----------------------------------------------------------------------------
-- Helper functions used by RLS policies below
-- ----------------------------------------------------------------------------
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_tenant_admin(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = p_tenant_id and tm.user_id = auth.uid() and tm.role = 'admin'
  );
$$;

-- Atomically create a tenant + its first (admin) member. Called via
-- supabase.rpc('create_tenant_with_owner', {...}) so the client never has to
-- insert directly into tenant_members before it has a membership row (which
-- RLS would otherwise block).
create or replace function public.create_tenant_with_owner(
  p_name text,
  p_industry text,
  p_currency text,
  p_company_name text,
  p_tax_id text,
  p_commission_rate numeric,
  p_owner_name text,
  p_owner_email text,
  p_id uuid default null
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants;
  v_slug text;
begin
  v_slug := lower(regexp_replace(coalesce(p_name, 'workspace'), '[^a-zA-Z0-9]+', '-', 'g'));

  insert into public.tenants (id, name, slug, industry, currency, owner_email, company_name, tax_id, commission_rate)
  values (coalesce(p_id, gen_random_uuid()), coalesce(p_name, 'New Workspace'), v_slug, p_industry, coalesce(p_currency, 'USD'), p_owner_email,
          coalesce(p_company_name, p_name), coalesce(p_tax_id, ''), coalesce(p_commission_rate, 10))
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, name, email, role)
  values (v_tenant.id, auth.uid(), p_owner_name, p_owner_email, 'admin');

  return v_tenant;
end;
$$;

-- ----------------------------------------------------------------------------
-- CRM record tables — all scoped by tenant_id
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id                  uuid primary key default gen_random_uuid(),
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
  primary_contact_id  uuid,
  salesperson         text,
  status              text not null default 'Prospect',
  customer_value      numeric not null default 0,
  notes               text,
  tags                text[] not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  first_name   text not null,
  last_name    text,
  position     text,
  company_id   uuid references public.companies(id) on delete set null,
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

create table if not exists public.leads (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  name                  text not null,
  company               text,
  job_title             text,
  email                 text,
  phone                 text,
  whatsapp              text,
  website               text,
  industry              text,
  country               text,
  city                  text,
  source                text,
  salesperson           text,
  lead_score            integer default 0,
  priority              text default 'Medium',
  status                text not null default 'New',
  estimated_value       numeric default 0,
  expected_close_date   date,
  last_contact          date,
  next_follow_up        date,
  tags                  text[] not null default '{}',
  notes                 text,
  converted_company_id  uuid references public.companies(id) on delete set null,
  converted_deal_id     uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.pipelines (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  name         text not null,
  description  text,
  stages       jsonb not null default '[]'::jsonb,
  is_default   boolean default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.deals (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants(id) on delete cascade,
  name                 text not null,
  company_id           uuid references public.companies(id) on delete cascade,
  contact_id           uuid references public.contacts(id) on delete set null,
  salesperson          text,
  pipeline_id          uuid references public.pipelines(id) on delete set null,
  stage_id             text,
  status               text not null default 'Open',
  deal_value           numeric not null default 0,
  currency             text default 'USD',
  probability          integer default 0,
  expected_close_date  date,
  product_service      text,
  source               text,
  priority             text default 'Medium',
  last_activity        date,
  next_activity        date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.invoices (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenants(id) on delete cascade,
  invoice_number        text not null,
  company_id            uuid references public.companies(id) on delete cascade,
  contact_id            uuid references public.contacts(id) on delete set null,
  deal_id               uuid references public.deals(id) on delete set null,
  issue_date            date,
  due_date              date,
  currency              text default 'USD',
  items                 jsonb not null default '[]'::jsonb,
  subtotal              numeric default 0,
  discount              numeric default 0,
  tax                   numeric default 0,
  total                 numeric default 0,
  amount_paid           numeric default 0,
  remaining_balance     numeric default 0,
  status                text not null default 'Draft',
  notes                 text,
  po_number             text,
  payment_terms         text,
  stripe_invoice_id     text,
  stripe_hosted_url     text,
  stripe_payment_link   text,
  stripe_status         text,
  stripe_live_mode      boolean default false,
  template_theme        text default 'executive',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  payment_number   text not null,
  company_id       uuid references public.companies(id) on delete cascade,
  invoice_id       uuid references public.invoices(id) on delete cascade,
  deal_id          uuid references public.deals(id) on delete set null,
  date             date not null default now(),
  amount           numeric not null default 0,
  currency         text default 'USD',
  payment_method   text default 'Bank Transfer',
  reference        text,
  notes            text,
  recorded_by      text,
  created_at       timestamptz not null default now()
);

create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  type          text not null default 'Note',
  company_id    uuid references public.companies(id) on delete cascade,
  contact_id    uuid references public.contacts(id) on delete set null,
  deal_id       uuid references public.deals(id) on delete set null,
  date          date not null default now(),
  time          text,
  "user"        text,
  description   text,
  outcome       text,
  next_action   text,
  created_at    timestamptz not null default now()
);

create table if not exists public.tasks (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  title          text not null,
  company_id     uuid references public.companies(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,
  deal_id        uuid references public.deals(id) on delete set null,
  assigned_user  text,
  priority       text default 'Medium',
  due_date       date,
  status         text not null default 'To Do',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  entity_type   text not null,
  entity_id     uuid not null,
  user_id       uuid,
  user_name     text,
  user_avatar   text,
  content       text not null,
  is_internal   boolean default true,
  replies       jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  actor        text,
  action       text not null,
  details      text,
  category     text default 'general',
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_companies_tenant   on public.companies(tenant_id);
create index if not exists idx_contacts_tenant     on public.contacts(tenant_id);
create index if not exists idx_leads_tenant        on public.leads(tenant_id);
create index if not exists idx_deals_tenant        on public.deals(tenant_id);
create index if not exists idx_pipelines_tenant    on public.pipelines(tenant_id);
create index if not exists idx_invoices_tenant     on public.invoices(tenant_id);
create index if not exists idx_payments_tenant     on public.payments(tenant_id);
create index if not exists idx_activities_tenant   on public.activities(tenant_id);
create index if not exists idx_tasks_tenant        on public.tasks(tenant_id);
create index if not exists idx_comments_tenant     on public.comments(tenant_id);
create index if not exists idx_audit_log_tenant    on public.audit_log(tenant_id);

-- ----------------------------------------------------------------------------
-- Row-level security — every table is only readable/writable by members of
-- that tenant. This is the boundary that makes multi-tenant isolation real
-- (instead of the frontend's own client-side filtering, which is not
-- security). Uses the anon key from the client, scoped by auth.uid().
-- ----------------------------------------------------------------------------
alter table public.tenants         enable row level security;
alter table public.tenant_members  enable row level security;
alter table public.companies       enable row level security;
alter table public.contacts        enable row level security;
alter table public.leads           enable row level security;
alter table public.deals           enable row level security;
alter table public.pipelines       enable row level security;
alter table public.invoices        enable row level security;
alter table public.payments        enable row level security;
alter table public.activities      enable row level security;
alter table public.tasks           enable row level security;
alter table public.comments        enable row level security;
alter table public.audit_log       enable row level security;

-- tenants: members can see/update their own tenant; deletion is admin-only
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants for select
  using (public.is_tenant_member(id));

drop policy if exists tenants_update on public.tenants;
create policy tenants_update on public.tenants for update
  using (public.is_tenant_admin(id));

drop policy if exists tenants_delete on public.tenants;
create policy tenants_delete on public.tenants for delete
  using (public.is_tenant_admin(id));

-- tenant creation happens only via the create_tenant_with_owner() function
-- above (security definer), so there is no direct insert policy on tenants.

-- tenant_members: members can see their own workspace's roster;
-- admins can add/update/remove members
drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members for select
  using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members for insert
  with check (public.is_tenant_admin(tenant_id));

drop policy if exists tenant_members_update on public.tenant_members;
create policy tenant_members_update on public.tenant_members for update
  using (public.is_tenant_admin(tenant_id));

drop policy if exists tenant_members_delete on public.tenant_members;
create policy tenant_members_delete on public.tenant_members for delete
  using (public.is_tenant_admin(tenant_id));

-- Generic per-tenant CRUD policy, applied identically to every CRM table.
-- (Row-level restriction is "you must be a member of this tenant"; finer
-- role-based permissions — e.g. sales_rep can't delete — are enforced in
-- the app layer via ROLE_PERMISSIONS, same as today.)
do $$
declare
  t text;
begin
  foreach t in array array['companies','contacts','leads','deals','pipelines',
                            'invoices','payments','activities','tasks','comments','audit_log']
  loop
    execute format('drop policy if exists %I_all on public.%I;', t, t);
    execute format(
      'create policy %I_all on public.%I for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));',
      t, t
    );
  end loop;
end $$;
