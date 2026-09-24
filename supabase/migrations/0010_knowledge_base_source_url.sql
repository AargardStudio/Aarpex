-- ============================================================================
-- Knowledge Base: entries drafted via "Generate from a link" (v1.15.0)
-- remember the page they were drafted from. Without this column, saving one
-- of those entries would fail the upsert (an unrecognized "source_url"
-- column) -- caught and surfaced via the sync-failure Audit Log entry
-- added in v1.13.4, but better to just have the column. Safe to re-run.
-- ============================================================================

alter table public.knowledge_base
  add column if not exists source_url text;
