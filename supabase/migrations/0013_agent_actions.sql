-- ============================================================================
-- Agent Approvals -- the human-in-the-loop queue for autonomous/negotiation
-- actions proposed per Industry Playbook (see AgentAction in src/types.ts).
-- Nothing here is ever sent on its own; every row is reviewed, edited, or
-- rejected by a user before anything reaches a prospect.
-- Also extends industry_playbooks with the autonomous-agent controls added
-- alongside this feature. Safe to re-run.
-- ============================================================================

alter table public.industry_playbooks
  add column if not exists auto_run_enabled boolean not null default false,
  add column if not exists max_discount_percent numeric not null default 0,
  add column if not exists negotiation_guidance text;

create table if not exists public.agent_actions (
  id                        uuid primary key default gen_random_uuid(),
  tenant_id                 uuid not null references public.tenants(id) on delete cascade,
  industry                  text not null,
  action_type               text not null,
  lead_id                   uuid,
  contact_id                uuid,
  recipient_name            text not null,
  recipient_email           text not null,
  subject                   text not null,
  body                      text not null,
  reasoning                 text,
  proposed_discount_percent numeric,
  product_id                uuid,
  trigger_snippet           text,
  status                    text not null default 'pending',
  trigger_source            text not null default 'manual',
  created_at                timestamptz not null default now(),
  resolved_at               timestamptz,
  resolved_by               text
);

create index if not exists idx_agent_actions_tenant on public.agent_actions(tenant_id);
create index if not exists idx_agent_actions_status on public.agent_actions(tenant_id, status);

alter table public.agent_actions enable row level security;

drop policy if exists agent_actions_all on public.agent_actions;
create policy agent_actions_all on public.agent_actions
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));
