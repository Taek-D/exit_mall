-- ============================================================================
-- Admin-only search RPC for inbound_requests joined with profiles.
-- PostgREST .or() does NOT filter joined relations through embedded-resource
-- syntax, so the admin list page uses this RPC for name/email partial match.
-- ============================================================================

create or replace function public.search_inbound_requests(
  p_q text default null,
  p_status text default null,
  p_limit int default 200
) returns table (
  id uuid,
  user_id uuid,
  title text,
  status text,
  last_comment_at timestamptz,
  last_comment_by_role text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  profile_name text,
  profile_email text
)
language sql stable security definer set search_path = public as $$
  select r.id, r.user_id, r.title, r.status,
         r.last_comment_at, r.last_comment_by_role,
         r.user_last_read_at, r.admin_last_read_at,
         r.created_at, r.updated_at,
         p.name as profile_name, p.email as profile_email
    from public.inbound_requests r
    join public.profiles p on p.id = r.user_id
   where public.is_admin()
     and (p_status is null or r.status = p_status)
     and (
       p_q is null or p_q = '' or
       p.name  ilike '%' || p_q || '%' or
       p.email ilike '%' || p_q || '%'
     )
   order by r.created_at desc
   limit greatest(0, least(coalesce(p_limit, 200), 500));
$$;

revoke execute on function public.search_inbound_requests(text, text, int) from public, anon;
grant execute on function public.search_inbound_requests(text, text, int) to authenticated;
