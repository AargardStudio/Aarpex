-- ============================================================================
-- Knowledge Base: attach "company" category entries to specific Leads,
-- Contacts, and/or Companies (an entry can be attached to many records at
-- once -- e.g. one "Healthcare industry context" entry linked to every
-- lead/company in that vertical). Safe to re-run.
-- ============================================================================

alter table public.knowledge_base
  add column if not exists linked_lead_ids     text[] not null default '{}',
  add column if not exists linked_contact_ids  text[] not null default '{}',
  add column if not exists linked_company_ids  text[] not null default '{}';
