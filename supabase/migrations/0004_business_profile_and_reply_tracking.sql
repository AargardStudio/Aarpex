-- ============================================================================
-- Adds the columns needed by three new features: Business Profiles (AI
-- analysis + manual call log riding on a Company), and Inbox reply-tracking
-- for Email Marketing campaigns.
--
-- IMPORTANT: the app's Supabase sync layer (src/lib/tenantDataSync.ts)
-- mirrors each entity's *entire* row on every save -- every camelCase field
-- present on the object is sent as a column. If a column doesn't exist yet,
-- the whole upsert for that table fails (not just the new field), which
-- silently breaks saving for every row of that table, not only the ones
-- using the new feature. Run this before using Business Profiles or Inbox.
-- Safe to re-run.
-- ============================================================================

alter table public.companies
  add column if not exists ai_analysis jsonb,
  add column if not exists call_log jsonb not null default '[]'::jsonb,
  add column if not exists source_lead_id text;

alter table public.email_campaigns
  add column if not exists replied_audience_ids text[] not null default '{}'::text[],
  add column if not exists last_reply_check_at timestamptz;
