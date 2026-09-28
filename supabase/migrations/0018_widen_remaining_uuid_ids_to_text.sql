-- ============================================================================
-- Widen the last remaining uuid record-id columns to text.
--
-- AarPex generates record ids with crypto.randomUUID() in newer code paths
-- but falls back to prefixed strings elsewhere -- `prod_<ts>_<rand>`,
-- `file_<ts>_<rand>`, `agt_<ts>_<rand>`, `usr_<ts>`, `lead_imp_<ts>_<i>`,
-- `comp_<ts>_<rand>`. A `uuid` column rejects every one of those outright
-- (22P02, invalid input syntax for type uuid), and because
-- upsertRowsResilient falls back to saving a failed chunk row-by-row, the
-- valid rows still saved while the rest were dropped -- a silent partial
-- sync with no user-visible sign. (The drop IS recorded, via onSyncFailure
-- into the workspace audit log, but nothing surfaces it in the UI.)
--
-- Most of this schema had already been moved to text ids; these four tables
-- were what remained. Note the migration files in this directory had drifted
-- badly from the live database by this point -- the live schema, not these
-- files, was the source of truth for what still needed changing.
--
-- Two of the columns here were worse than merely inconvenient: they are
-- reference columns pointing at tables whose ids are ALREADY text, so no
-- valid value could ever be stored in them:
--   stored_files.linked_company_id / linked_contact_id / linked_deal_id /
--   linked_lead_id  -> companies / contacts / deals / leads (all text)
--   comments.user_id -> users created as `usr_<ts>` by User Access Control
--
-- Every id keeps its existing value; `id::text` on a uuid yields the same
-- canonical hyphenated string, so nothing is rewritten or re-keyed and every
-- existing reference stays valid. Safe to re-run is NOT claimed here: the
-- `alter column ... type` statements are not idempotent, so this runs once.
-- ============================================================================

-- products.id, plus the single foreign key that references it. The FK has to
-- come off before either side can change type, then goes straight back on.
alter table public.email_campaigns drop constraint if exists email_campaigns_product_id_fkey;

alter table public.products alter column id drop default;
alter table public.products alter column id type text using id::text;
alter table public.products alter column id set default (gen_random_uuid())::text;

alter table public.email_campaigns alter column product_id type text using product_id::text;

alter table public.email_campaigns
  add constraint email_campaigns_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- stored_files: its own id, plus the four link columns that point at tables
-- already keyed by text.
alter table public.stored_files alter column id drop default;
alter table public.stored_files alter column id type text using id::text;
alter table public.stored_files alter column id set default (gen_random_uuid())::text;

alter table public.stored_files
  alter column linked_company_id type text using linked_company_id::text,
  alter column linked_contact_id type text using linked_contact_id::text,
  alter column linked_deal_id    type text using linked_deal_id::text,
  alter column linked_lead_id    type text using linked_lead_id::text;

-- comments.user_id holds currentUser.id, which is `usr_<ts>` for any user
-- created through User Access Control.
alter table public.comments alter column user_id type text using user_id::text;

-- industry_agents / agent_actions own ids (both randomUUID with an `agt_`
-- fallback).
alter table public.industry_agents alter column id drop default;
alter table public.industry_agents alter column id type text using id::text;
alter table public.industry_agents alter column id set default (gen_random_uuid())::text;

alter table public.agent_actions alter column id drop default;
alter table public.agent_actions alter column id type text using id::text;
alter table public.agent_actions alter column id set default (gen_random_uuid())::text;

notify pgrst, 'reload schema';
