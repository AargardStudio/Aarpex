-- ============================================================================
-- Fix: entity id/reference columns were typed `uuid`, but the app has always
-- generated its own non-UUID string ids client-side (e.g. "LD-483" for
-- leads, "comp_1758..." for companies, "tsk_..." for tasks). Every upsert
-- from the client to these tables has therefore been failing at the
-- database level with "invalid input syntax for type uuid" -- silently
-- logged to the console, never surfaced to the user. This is the root cause
-- behind CRM records (leads, contacts, deals, etc.) appearing to vanish on
-- next sign-in even after a real tenant/workspace exists.
--
-- Fix: retype every affected id/reference column to `text`, matching what
-- the client actually sends. tenant_id stays `uuid` (tenant ids ARE real
-- UUIDs, generated via crypto.randomUUID() at tenant-creation time), so
-- tenant scoping and RLS are unaffected.
--
-- Safe to run on production: because of the bug above, these CRM record
-- tables have never successfully held client-written rows, so there is
-- effectively no data to lose here. Run once in the Supabase SQL Editor.
-- ============================================================================

-- Drop every foreign key that points at the id columns we're about to
-- retype (found dynamically so this doesn't depend on Postgres's default
-- constraint-naming convention).
do $$
declare
  r record;
begin
  for r in
    select con.conname as conname, con.conrelid::regclass as tbl
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid in (
        'public.companies'::regclass,
        'public.contacts'::regclass,
        'public.leads'::regclass,
        'public.deals'::regclass,
        'public.pipelines'::regclass,
        'public.invoices'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- Retype primary keys and every reference column to text.
alter table public.companies  alter column id type text using id::text;
alter table public.companies  alter column id set default gen_random_uuid()::text;
alter table public.companies  alter column primary_contact_id type text using primary_contact_id::text;

alter table public.contacts   alter column id type text using id::text;
alter table public.contacts   alter column id set default gen_random_uuid()::text;
alter table public.contacts   alter column company_id type text using company_id::text;

alter table public.leads      alter column id type text using id::text;
alter table public.leads      alter column id set default gen_random_uuid()::text;
alter table public.leads      alter column converted_company_id type text using converted_company_id::text;
alter table public.leads      alter column converted_deal_id type text using converted_deal_id::text;

alter table public.pipelines  alter column id type text using id::text;
alter table public.pipelines  alter column id set default gen_random_uuid()::text;

alter table public.deals      alter column id type text using id::text;
alter table public.deals      alter column id set default gen_random_uuid()::text;
alter table public.deals      alter column company_id type text using company_id::text;
alter table public.deals      alter column contact_id type text using contact_id::text;
alter table public.deals      alter column pipeline_id type text using pipeline_id::text;

alter table public.invoices   alter column id type text using id::text;
alter table public.invoices   alter column id set default gen_random_uuid()::text;
alter table public.invoices   alter column company_id type text using company_id::text;
alter table public.invoices   alter column contact_id type text using contact_id::text;
alter table public.invoices   alter column deal_id type text using deal_id::text;

alter table public.payments   alter column id type text using id::text;
alter table public.payments   alter column id set default gen_random_uuid()::text;
alter table public.payments   alter column company_id type text using company_id::text;
alter table public.payments   alter column invoice_id type text using invoice_id::text;
alter table public.payments   alter column deal_id type text using deal_id::text;

alter table public.activities alter column id type text using id::text;
alter table public.activities alter column id set default gen_random_uuid()::text;
alter table public.activities alter column company_id type text using company_id::text;
alter table public.activities alter column contact_id type text using contact_id::text;
alter table public.activities alter column deal_id type text using deal_id::text;

alter table public.tasks      alter column id type text using id::text;
alter table public.tasks      alter column id set default gen_random_uuid()::text;
alter table public.tasks      alter column company_id type text using company_id::text;
alter table public.tasks      alter column contact_id type text using contact_id::text;
alter table public.tasks      alter column deal_id type text using deal_id::text;

alter table public.comments   alter column id type text using id::text;
alter table public.comments   alter column id set default gen_random_uuid()::text;
alter table public.comments   alter column entity_id type text using entity_id::text;

alter table public.audit_log  alter column id type text using id::text;
alter table public.audit_log  alter column id set default gen_random_uuid()::text;

-- Recreate the foreign keys, now text-to-text.
alter table public.contacts   add constraint contacts_company_id_fkey foreign key (company_id) references public.companies(id) on delete set null;
alter table public.leads      add constraint leads_converted_company_id_fkey foreign key (converted_company_id) references public.companies(id) on delete set null;
alter table public.deals      add constraint deals_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.deals      add constraint deals_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null;
alter table public.deals      add constraint deals_pipeline_id_fkey foreign key (pipeline_id) references public.pipelines(id) on delete set null;
alter table public.invoices   add constraint invoices_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.invoices   add constraint invoices_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null;
alter table public.invoices   add constraint invoices_deal_id_fkey foreign key (deal_id) references public.deals(id) on delete set null;
alter table public.payments   add constraint payments_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.payments   add constraint payments_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete cascade;
alter table public.payments   add constraint payments_deal_id_fkey foreign key (deal_id) references public.deals(id) on delete set null;
alter table public.activities add constraint activities_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.activities add constraint activities_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null;
alter table public.activities add constraint activities_deal_id_fkey foreign key (deal_id) references public.deals(id) on delete set null;
alter table public.tasks      add constraint tasks_company_id_fkey foreign key (company_id) references public.companies(id) on delete cascade;
alter table public.tasks      add constraint tasks_contact_id_fkey foreign key (contact_id) references public.contacts(id) on delete set null;
alter table public.tasks      add constraint tasks_deal_id_fkey foreign key (deal_id) references public.deals(id) on delete set null;

-- ============================================================================
-- NEW: EMAIL_CAMPAIGNS  (AI-generated email marketing sequences)
-- ============================================================================
create table if not exists public.email_campaigns (
  id               text primary key default gen_random_uuid()::text,
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null,
  audience_type    text not null default 'Leads',
  audience_ids     text[] not null default '{}',
  frequency        text not null default 'Weekly',
  frequency_days   integer not null default 7,
  follow_up_count  integer not null default 2,
  technique        text not null default 'Mixed',
  status           text not null default 'Draft',
  steps            jsonb not null default '[]'::jsonb,
  start_date       date,
  salesperson      text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_email_campaigns_tenant on public.email_campaigns(tenant_id);

alter table public.email_campaigns enable row level security;

drop policy if exists email_campaigns_all on public.email_campaigns;
create policy email_campaigns_all on public.email_campaigns for all
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
