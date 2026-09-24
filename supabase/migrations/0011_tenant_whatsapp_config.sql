-- ============================================================================
-- WhatsApp Business (Meta Cloud API) connection per tenant (v1.18.0).
-- Same pattern as stripe_config: one JSON object per tenant on the tenants
-- row itself, written by the hand-written performTenantRowSync path (not
-- the generic TenantTable mirror-sync used for companies/leads/etc).
-- Safe to re-run.
-- ============================================================================

alter table public.tenants
  add column if not exists whatsapp_config jsonb not null default '{}'::jsonb;
