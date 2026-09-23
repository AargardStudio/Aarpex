-- ============================================================================
-- Fix: leads.linked_company_id / leads.linked_contact_id were missing.
--
-- Root cause of "Sync All to Companies/Contacts" still not persisting after
-- the v1.11.0 fix: that fix made the app write linkedCompanyId/linkedContactId
-- onto each synced Lead, but the leads table in Supabase was never given
-- matching columns. The app's Supabase mirror sync (src/lib/tenantDataSync.ts)
-- upserts every field of every row in one call PER TABLE -- so as soon as any
-- lead in the array carried linked_company_id/linked_contact_id, Postgres
-- rejected the whole upsert with "column does not exist", and the ENTIRE
-- leads table silently stopped syncing to Supabase for that tenant (visible
-- only in the browser console as "[tenantDataSync] upsert failed for leads").
--
-- The badge/linkage looked correct in the browser (state + localStorage were
-- fine) but vanished on reload/re-login, because Supabase -- where the write
-- never actually landed -- is treated as the source of truth on every load.
-- This also meant no OTHER lead edit was syncing to Supabase in the
-- meantime, for any tenant that had run a sync since v1.11.0 shipped.
--
-- Safe to re-run.
-- ============================================================================

-- companies.id / contacts.id are `text`, not `uuid` (see migration 0002's
-- fix for the id/uuid type mismatch) -- match that here, or these columns
-- would reject every real id the app ever generates.
alter table public.leads
  add column if not exists linked_company_id  text references public.companies(id) on delete set null,
  add column if not exists linked_contact_id  text references public.contacts(id)  on delete set null;

create index if not exists idx_leads_linked_company on public.leads(linked_company_id);
create index if not exists idx_leads_linked_contact  on public.leads(linked_contact_id);
