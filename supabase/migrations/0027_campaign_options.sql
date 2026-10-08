-- Campaign maker options (tone, length, language, CTA, signature, skip weekends, ...)
alter table public.email_campaigns add column if not exists options jsonb;
