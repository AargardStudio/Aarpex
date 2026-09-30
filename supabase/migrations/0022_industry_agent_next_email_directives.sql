-- One-shot "instant control" switches on Industry Agents. Each is armed from
-- the agent card ("Add pricing in the next email" / "Add more problems
-- relevant to this business and discuss in the next email") and is consumed --
-- reset to false -- as soon as the agent drafts its next batch of emails, so
-- they only ever affect the very next batch.
--
-- Deliberately NULLABLE (default false, no `not null`): tenantDataSync omits
-- undefined keys, so batches of agents are heterogeneous and postgrest-js
-- writes an explicit NULL into any column a given row is missing (see
-- 0017_relax_not_null_array_columns.sql for the failure this causes). An
-- agent that never touches these controls simply has NULL/false, which the
-- app and the server-side scan both treat as "off".
alter table public.industry_agents add column if not exists next_email_include_pricing boolean default false;
alter table public.industry_agents add column if not exists next_email_extra_problems boolean default false;

notify pgrst, 'reload schema';
