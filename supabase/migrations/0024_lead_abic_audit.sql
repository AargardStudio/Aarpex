-- ABIC (Aargard Business Intelligence Construct) audit results on leads.
--   abic_audited_at         : ISO timestamp of the last audit attempt
--   abic_score              : overall ABIC score 0-100
--   abic_opportunity_score  : Aargard Opportunity Score 0-100
--   abic_priority           : Aargard lead priority A | B | C | D
--   abic_snapshot           : the full structured snapshot, stored as JSON text
--                             (text, not jsonb, so tenantDataSync's mechanical
--                             camelCase<->snake_case key mapping never touches
--                             the nested keys)
--
-- All NULLABLE: tenantDataSync omits undefined keys, so heterogeneous batches
-- write explicit NULLs into any column a row lacks (see 0017).
alter table public.leads add column if not exists abic_audited_at text;
alter table public.leads add column if not exists abic_score integer;
alter table public.leads add column if not exists abic_opportunity_score integer;
alter table public.leads add column if not exists abic_priority text;
alter table public.leads add column if not exists abic_snapshot text;

notify pgrst, 'reload schema';
