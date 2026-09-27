-- ============================================================================
-- Schema drift repair.
--
-- Background: src/lib/tenantDataSync.ts's toRow() is fully mechanical -- it
-- snake_cases EVERY field present on the app object and sends it to the
-- matching Supabase table. There is no compile-time or runtime link between
-- the TypeScript interfaces in src/types.ts and the actual database schema,
-- so any field added to an interface silently starts being written to
-- Supabase. If no migration ever added the matching column, PostgREST
-- rejects the ENTIRE row upsert with:
--
--   "Could not find the '<column>' column of '<table>' in the schema cache"
--
-- Note that this fails the whole row, not just the unknown field -- so one
-- missing column silently breaks persistence for that entire table. That is
-- why Industry Agents (and their exclusions) appeared to save in the UI but
-- vanished on reload: the local React/localStorage write succeeded while
-- every Supabase write 400'd.
--
-- An audit of every synced table (diffing each TypeScript interface against
-- the columns these migration files actually create) found the following
-- columns referenced by the app but never created. Each one is added here.
-- Safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- industry_agents -- the table behind the reported bug.
--
-- product_id:  added with "link a Playbook to a Product/Service" (v1.27.0)
-- excluded_*:  added with the Matching Businesses opt-out checkboxes (v1.28.0)
--
-- These are app-generated record ids, which are NOT guaranteed to be uuids
-- (see the note at the bottom of this file), so they are text -- matching the
-- precedent already set by 0009_knowledge_base_entity_links.sql, which
-- likewise stores linked record ids as text[].
-- ----------------------------------------------------------------------------
alter table public.industry_agents
  add column if not exists product_id           text,
  add column if not exists excluded_lead_ids    text[] not null default '{}',
  add column if not exists excluded_company_ids text[] not null default '{}';

-- ----------------------------------------------------------------------------
-- companies / leads -- clientCategory (the Client Category picklist added
-- alongside the standardized industry picklist), and a Lead's socialLinks
-- (an array of {id, platform, url} objects, so jsonb rather than text[]).
-- ----------------------------------------------------------------------------
alter table public.companies
  add column if not exists client_category text;

alter table public.leads
  add column if not exists client_category text,
  add column if not exists social_links    jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- activities -- Activity.leadId. The other entity links on this table
-- (company_id, contact_id, deal_id) are real uuid foreign keys from 0001,
-- but lead_id was never added at all.
-- ----------------------------------------------------------------------------
alter table public.activities
  add column if not exists lead_id text;

-- ----------------------------------------------------------------------------
-- knowledge_base -- KnowledgeBaseEntry.linkedFileId (links an entry to a
-- record in stored_files).
-- ----------------------------------------------------------------------------
alter table public.knowledge_base
  add column if not exists linked_file_id text;

-- ----------------------------------------------------------------------------
-- agent_actions -- "whatever campaign runs, its actions do not save".
--
-- This table's own columns were all correct, but lead_id/contact_id/product_id
-- were declared uuid while the values written to them are app record ids that
-- are frequently NOT uuids -- e.g. bulk-imported leads get ids shaped like
-- `lead_imp_1790018855679_117` (see importLeadsFromSpreadsheet in
-- CRMContext.tsx). Postgres rejects those with invalid input syntax for type
-- uuid (22P02), failing the whole insert.
--
-- None of these three are declared as foreign keys, so widening them to text
-- is safe and loses nothing.
-- ----------------------------------------------------------------------------
alter table public.agent_actions
  alter column lead_id    type text using lead_id::text,
  alter column contact_id type text using contact_id::text,
  alter column product_id type text using product_id::text;

-- ----------------------------------------------------------------------------
-- Tell PostgREST to pick all of this up immediately rather than waiting for
-- its schema cache to expire on its own.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================================
-- KNOWN REMAINING ISSUE -- deliberately NOT changed here.
--
-- Every synced table still declares `id uuid primary key`, but the app
-- generates non-uuid text ids in several places, so those records can never
-- sync no matter what columns exist:
--
--   importLeadsFromSpreadsheet  -> `lead_imp_<ts>_<i>`   (leads)
--   lead -> company conversion  -> `comp_<ts>_<rand>`    (companies)
--   addActivity                 -> `act_<ts>_<rand>`     (activities)
--   addTask                     -> `tsk_<ts>`            (tasks)
--   addComment                  -> `cm_<ts>`             (comments)
--   addPipeline                 -> `pipe_<ts>`           (pipelines)
--
-- Newer code paths (Industry Agents, Knowledge Base, agent_actions, mailboxes)
-- correctly use crypto.randomUUID(), which is why those tables work once their
-- columns exist -- this migration fully unblocks them.
--
-- Fixing the rest means choosing between widening those id columns to text
-- (preserves all existing local records as-is) or switching the app to
-- generate uuids everywhere (requires remapping ids on existing local data
-- and every cross-reference that points at them). That is an architectural
-- decision with real data-migration consequences, so it is left for a
-- deliberate follow-up rather than bundled in here.
--
-- Separately: public.email_campaigns is ALTERed by 0004 and 0005 but is never
-- CREATED by any migration in this directory, so its live shape cannot be
-- verified from this repo and is not touched here.
-- ============================================================================
