-- ============================================================================
-- File Manager -- workspace file metadata (see StoredFile in src/types.ts).
-- Only metadata lives here; the actual bytes live in the Supabase Storage
-- bucket named 'tenant-files' (created lazily by the server on first
-- upload), at the path recorded in storage_path. size is in bytes and is
-- summed per tenant to enforce each plan's storage quota
-- (STORAGE_LIMITS_BYTES in src/data/subscriptionPlans.ts), enforced
-- server-side in /api/storage/upload. Safe to re-run.
-- ============================================================================

create table if not exists public.stored_files (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  filename          text not null,
  content_type      text not null,
  size              bigint not null default 0,
  storage_path      text not null,
  source            text not null default 'manual_upload',
  linked_lead_id    uuid,
  linked_contact_id uuid,
  linked_company_id uuid,
  linked_deal_id    uuid,
  uploaded_by       text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_stored_files_tenant on public.stored_files(tenant_id);

alter table public.stored_files enable row level security;

drop policy if exists stored_files_all on public.stored_files;
create policy stored_files_all on public.stored_files
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
