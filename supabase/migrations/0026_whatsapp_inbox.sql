-- WhatsApp inbox: every WhatsApp message to/from a lead (Meta Cloud API).
--   Outbound rows are written by the app when you (or an approved agent
--   draft) send. Inbound rows are written by the /api/whatsapp/webhook
--   endpoint using the service role, so they appear even when nobody has
--   AarPex open.
-- Also: WhatsApp drafts in Agent Approvals (recipient_phone) and a per-agent
--   switch to let an Industry Agent work leads over WhatsApp.
-- Deliberately NOT part of the generic mirror-sync (which deletes rows that
-- the browser doesn't hold) -- the app reads and appends here directly.
-- All new columns on existing tables are nullable (see 0017).

create table if not exists public.whatsapp_messages (
  id               text primary key,          -- Meta message id (wamid...) or a local id
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  lead_id          text,
  phone            text not null,             -- digits only, E.164 without "+"
  direction        text not null,             -- 'in' | 'out'
  body             text,
  template_name    text,
  status           text,                      -- sent | delivered | read | failed | received
  error            text,
  source           text,                      -- manual | agent_approved | webhook
  sent_by          text,
  ai_handled_at    timestamptz,               -- inbound: agent already looked at it
  created_at       timestamptz not null default now()
);

create index if not exists idx_wa_messages_tenant_time on public.whatsapp_messages(tenant_id, created_at desc);
create index if not exists idx_wa_messages_tenant_phone on public.whatsapp_messages(tenant_id, phone);

alter table public.whatsapp_messages enable row level security;
drop policy if exists whatsapp_messages_all on public.whatsapp_messages;
create policy whatsapp_messages_all on public.whatsapp_messages
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

alter table public.agent_actions add column if not exists recipient_phone text;
alter table public.agent_actions add column if not exists template_name text;
alter table public.agent_actions add column if not exists template_language text;
alter table public.agent_actions add column if not exists template_params jsonb;
alter table public.industry_agents add column if not exists whatsapp_enabled boolean default false;
alter table public.industry_agents add column if not exists whatsapp_template_name text;
alter table public.industry_agents add column if not exists whatsapp_template_language text;
alter table public.industry_agents add column if not exists whatsapp_template_text text;
alter table public.industry_agents add column if not exists whatsapp_template_params text;

notify pgrst, 'reload schema';
