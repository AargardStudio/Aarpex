-- Customisable ABIC audits: each Industry Agent can carry its own audit focus
-- (free text, e.g. "we sell packaging to honey producers") and a list of
-- yes/no questions answered from each lead's website (e.g. "Do they sell
-- honey?"). Nullable -- see 0017 / tenantDataSync's explicit-NULL behaviour.
alter table public.industry_agents add column if not exists audit_focus text;
alter table public.industry_agents add column if not exists audit_checks text[];

notify pgrst, 'reload schema';
