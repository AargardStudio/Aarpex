-- Campaign sync writes mailbox_id (which connected mailbox sends the campaign).
-- The column was missing, so every email_campaigns upsert failed with HTTP 400
-- and campaigns never persisted. Already applied live; idempotent.
alter table public.email_campaigns add column if not exists mailbox_id text;
