-- "Take Charge" + reply learning on leads.
--   operator_in_control : operator handles this lead personally; Industry Agents
--                         stop drafting for it and only notify.
--   last_reply_key      : id of the last inbound reply already learned from.
--
-- Deliberately NULLABLE (no `not null`): tenantDataSync omits undefined keys, so
-- batches of leads are heterogeneous and postgrest-js writes an explicit NULL
-- into any column a row is missing (see 0017_relax_not_null_array_columns.sql).
-- NULL is treated as "off" / "nothing processed yet" everywhere.
alter table public.leads add column if not exists operator_in_control boolean default false;
alter table public.leads add column if not exists last_reply_key text;

notify pgrst, 'reload schema';
