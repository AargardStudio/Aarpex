-- Remove Companies and Contacts entirely ahead of a from-scratch rebuild of
-- both on a proper framework. A full JSON backup of every row in both
-- tables was taken and handed to the workspace owner before this migration
-- ran (see chat/commit history for 2026-09-28) -- this is a deliberate,
-- approved, irreversible removal, not an accidental drop.
--
-- Order matters: every foreign key that points at companies/contacts has to
-- go, and the columns that held those ids are removed too (an orphaned
-- uuid/text column pointing at a table that no longer exists is dead
-- weight, not a useful placeholder), before the two tables themselves can
-- be dropped.

-- ---------------------------------------------------------------------
-- 1. Drop every FK constraint referencing companies or contacts
-- ---------------------------------------------------------------------
alter table public.activities drop constraint if exists activities_company_id_fkey;
alter table public.activities drop constraint if exists activities_contact_id_fkey;
alter table public.contacts drop constraint if exists contacts_company_id_fkey;
alter table public.deals drop constraint if exists deals_company_id_fkey;
alter table public.deals drop constraint if exists deals_contact_id_fkey;
alter table public.invoices drop constraint if exists invoices_company_id_fkey;
alter table public.invoices drop constraint if exists invoices_contact_id_fkey;
alter table public.leads drop constraint if exists leads_converted_company_id_fkey;
alter table public.leads drop constraint if exists leads_linked_company_id_fkey;
alter table public.leads drop constraint if exists leads_linked_contact_id_fkey;
alter table public.payments drop constraint if exists payments_company_id_fkey;
alter table public.tasks drop constraint if exists tasks_company_id_fkey;
alter table public.tasks drop constraint if exists tasks_contact_id_fkey;

-- ---------------------------------------------------------------------
-- 2. Drop the now-orphaned id columns on every dependent table
-- ---------------------------------------------------------------------
alter table public.activities drop column if exists company_id;
alter table public.activities drop column if exists contact_id;
alter table public.deals drop column if exists company_id;
alter table public.deals drop column if exists contact_id;
alter table public.invoices drop column if exists company_id;
alter table public.invoices drop column if exists contact_id;
alter table public.leads drop column if exists converted_company_id;
alter table public.leads drop column if exists linked_company_id;
alter table public.leads drop column if exists linked_contact_id;
alter table public.payments drop column if exists company_id;
alter table public.tasks drop column if exists company_id;
alter table public.tasks drop column if exists contact_id;

-- These four never had an explicit FK constraint (plain id / id[] columns)
-- but still point at rows in companies/contacts, so they're just as
-- orphaned once those tables are gone.
alter table public.agent_actions drop column if exists contact_id;
alter table public.industry_agents drop column if exists excluded_company_ids;
alter table public.knowledge_base drop column if exists linked_company_ids;
alter table public.knowledge_base drop column if exists linked_contact_ids;
alter table public.stored_files drop column if exists linked_company_id;
alter table public.stored_files drop column if exists linked_contact_id;

-- ---------------------------------------------------------------------
-- 3. Drop the tables themselves. CASCADE is a safety net for anything not
--    explicitly listed above (e.g. a view), not a substitute for the
--    explicit drops -- everything expected to depend on these tables was
--    already detached above.
-- ---------------------------------------------------------------------
drop table if exists public.companies cascade;
drop table if exists public.contacts cascade;

notify pgrst, 'reload schema';
