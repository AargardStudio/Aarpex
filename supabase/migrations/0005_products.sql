-- ============================================================================
-- Products / Services catalog -- the versatile "what we sell" table (agency
-- retainers, SaaS subscriptions, tour packages, one-off B2B products, etc.),
-- plus linking Email Marketing campaigns to a product they're promoting.
-- Safe to re-run.
-- ============================================================================

create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null,
  type             text not null default 'Other',
  pricing_model    text not null default 'Custom Quote',
  price            numeric not null default 0,
  currency         text default 'USD',
  status           text not null default 'Draft',
  description      text,
  pitch            text,
  -- Who this should be sold to: industries/statuses/countries/tags/lead
  -- sources to match against, plus a free-text note. See
  -- ProductTargetCriteria in src/types.ts for the exact shape.
  target_criteria  jsonb not null default '{"industries":[],"companyStatuses":[],"countries":[],"tags":[],"leadSources":[],"idealCustomerNotes":""}'::jsonb,
  -- AI-generated positioning/targeting suggestions. See ProductAIInsight in
  -- src/types.ts.
  ai_insight       jsonb,
  created_by       text,
  tags             text[] not null default '{}',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_products_tenant on public.products(tenant_id);

alter table public.products enable row level security;

drop policy if exists products_all on public.products;
create policy products_all on public.products
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- Optional link from a campaign to the product it's promoting -- used to
-- pre-select a matching audience and seed the AI email copy with the
-- product's pitch. Nullable/on delete set null: deleting a product should
-- never take an email campaign down with it.
alter table public.email_campaigns
  add column if not exists product_id uuid references public.products(id) on delete set null;
