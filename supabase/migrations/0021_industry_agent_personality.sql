-- Optional personality dials on Industry Agents, layered on top of the
-- existing tone/talkingPoints/painPoints/objectionNotes/customInstructions
-- fields already used to build every AI draft prompt for this agent (see
-- server.ts's /api/ai/personalized-email and /api/ai/email-sequence prompt
-- building). Both nullable, no backfill needed -- an agent with neither set
-- behaves exactly as it did before this migration.
alter table public.industry_agents add column if not exists agent_nature text;
alter table public.industry_agents add column if not exists personality_type text;

notify pgrst, 'reload schema';
