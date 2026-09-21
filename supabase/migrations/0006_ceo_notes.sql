-- ============================================================================
-- CEO Notes -- an internal, workspace-visible journal for the founder/CEO to
-- log reflections, activity, and progress updates. A memoir-style running
-- log, not a CRM record: no company/contact/deal linkage. Safe to re-run.
-- ============================================================================

create table if not exists public.ceo_notes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  title        text not null,
  content      text not null,
  type         text not null default 'Note',
  date         date not null default current_date,
  author_name  text not null default '',
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index if not exists idx_ceo_notes_tenant on public.ceo_notes(tenant_id);
create index if not exists idx_ceo_notes_date on public.ceo_notes(tenant_id, date desc);

alter table public.ceo_notes enable row level security;

drop policy if exists ceo_notes_all on public.ceo_notes;
create policy ceo_notes_all on public.ceo_notes
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
