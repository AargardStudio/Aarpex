-- ============================================================================
-- Fix: create_tenant_with_owner() is missing its p_id parameter
--
-- The version currently live in this project has 8 parameters (no p_id),
-- but the app calls it with 9 (including p_id, so it can reuse the
-- client-generated workspace UUID as the tenant row's real id). Because
-- PostgREST resolves RPC calls by exact parameter-name match, the call
-- 404s with "Could not find the function ... in the schema cache" and the
-- workspace is never created -- which is also why every write after it
-- (leads, pipelines, etc.) fails RLS: there's no tenant_members row for a
-- tenant that never existed.
--
-- This drops every existing overload of create_tenant_with_owner (there
-- should only be the stale 8-arg one) and recreates the correct 9-arg
-- version, matching supabase/migrations/0001_aarpex_schema.sql.
-- Safe to re-run.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where proname = 'create_tenant_with_owner'
      and pronamespace = 'public'::regnamespace
  loop
    execute format('drop function %s', r.sig);
  end loop;
end $$;

create function public.create_tenant_with_owner(
  p_name text,
  p_industry text,
  p_currency text,
  p_company_name text,
  p_tax_id text,
  p_commission_rate numeric,
  p_owner_name text,
  p_owner_email text,
  p_id uuid default null
)
returns public.tenants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants;
  v_slug text;
begin
  v_slug := lower(regexp_replace(coalesce(p_name, 'workspace'), '[^a-zA-Z0-9]+', '-', 'g'));

  insert into public.tenants (id, name, slug, industry, currency, owner_email, company_name, tax_id, commission_rate)
  values (coalesce(p_id, gen_random_uuid()), coalesce(p_name, 'New Workspace'), v_slug, p_industry, coalesce(p_currency, 'USD'), p_owner_email,
          coalesce(p_company_name, p_name), coalesce(p_tax_id, ''), coalesce(p_commission_rate, 10))
  returning * into v_tenant;

  insert into public.tenant_members (tenant_id, user_id, name, email, role)
  values (v_tenant.id, auth.uid(), p_owner_name, p_owner_email, 'admin');

  return v_tenant;
end;
$$;

grant execute on function public.create_tenant_with_owner(
  text, text, text, text, text, numeric, text, text, uuid
) to anon, authenticated, service_role;
