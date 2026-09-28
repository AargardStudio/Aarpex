-- Free-text "behavior customization" field on Industry Agents -- extra
-- instructions layered onto the tone/talkingPoints/painPoints/
-- objectionNotes fields already used to build every AI draft prompt for
-- this agent (see server.ts's /api/ai/personalized-email prompt-building).
-- Purely additive, nullable, no backfill needed.
alter table public.industry_agents add column if not exists custom_instructions text;

notify pgrst, 'reload schema';
