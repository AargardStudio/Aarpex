-- Aargard Connect: database-backed rate limiting (replaces the per-instance
-- in-memory counter, which did not hold across serverless instances).
create table if not exists public.connect_rate_limits (
  key_id text not null,
  bucket bigint not null,
  hits integer not null default 0,
  primary key (key_id, bucket)
);
alter table public.connect_rate_limits enable row level security;

create or replace function public.connect_rate_hit(p_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare b bigint := floor(extract(epoch from now()) / 60); h integer;
begin
  insert into public.connect_rate_limits(key_id, bucket, hits) values (p_key, b, 1)
  on conflict (key_id, bucket) do update set hits = connect_rate_limits.hits + 1
  returning hits into h;
  if random() < 0.02 then delete from public.connect_rate_limits where bucket < b - 5; end if;
  return h;
end $$;
revoke all on function public.connect_rate_hit(text) from public, anon, authenticated;
grant execute on function public.connect_rate_hit(text) to service_role;
notify pgrst, 'reload schema';
