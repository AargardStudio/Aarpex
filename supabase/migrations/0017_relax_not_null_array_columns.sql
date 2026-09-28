-- ============================================================================
-- Relax `not null` on the array columns that a sync row may legitimately omit.
--
-- postgrest-js builds an insert's column list as the UNION of the keys across
-- every row in the batch, and unless `Prefer: missing=default` is sent it
-- writes an explicit NULL into any column a given row happens to be missing.
-- Rows produced by tenantDataSync's toRow() omit keys whose value is
-- `undefined`, so batches are routinely heterogeneous -- one Industry Agent
-- has excludedLeadIds and the next doesn't; one Knowledge Base entry links
-- leads while the next links contacts. The result was a hard failure against
-- every `not null` column:
--
--   null value in column "linked_contact_ids" of relation "knowledge_base"
--   violates not-null constraint
--
-- and because upsertRowsResilient retries a failed chunk row-by-row, every
-- row in that batch failed too -- so the whole table silently stopped saving.
--
-- The real fix is client-side (`defaultToNull: false`, shipped alongside this
-- migration), but any browser still running a cached older build will keep
-- sending NULLs, so these columns are relaxed to nullable as well. Defaults
-- are kept, so an omitted column still lands as '{}', and every consumer of
-- these fields already treats null and [] identically (`x || []`).
-- Safe to re-run.
-- ============================================================================

alter table public.knowledge_base
  alter column tags               drop not null,
  alter column linked_lead_ids    drop not null,
  alter column linked_contact_ids drop not null,
  alter column linked_company_ids drop not null;

alter table public.industry_agents
  alter column talking_points       drop not null,
  alter column pain_points          drop not null,
  alter column excluded_lead_ids    drop not null,
  alter column excluded_company_ids drop not null;

alter table public.companies alter column tags drop not null;
alter table public.leads     alter column tags drop not null;
alter table public.contacts  alter column tags drop not null;

update public.knowledge_base
   set tags               = coalesce(tags, '{}'),
       linked_lead_ids    = coalesce(linked_lead_ids, '{}'),
       linked_contact_ids = coalesce(linked_contact_ids, '{}'),
       linked_company_ids = coalesce(linked_company_ids, '{}')
 where tags is null or linked_lead_ids is null
    or linked_contact_ids is null or linked_company_ids is null;

notify pgrst, 'reload schema';
