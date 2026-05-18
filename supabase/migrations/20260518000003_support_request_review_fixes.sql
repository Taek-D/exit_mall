-- Review fixes for support request comment deletion and attachment rollback.

create or replace function public.delete_support_comment(
  p_comment_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.support_request_comments%rowtype;
  v_req public.support_requests%rowtype;
  v_latest_created_at timestamptz;
  v_latest_author_role text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_comment
  from public.support_request_comments
  where id = p_comment_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_req
  from public.support_requests
  where id = v_comment.request_id
  for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_req.status in ('completed','cancelled') then
    raise exception 'LOCKED';
  end if;

  if not (
    public.is_admin()
    or (
      v_comment.author_id = auth.uid()
      and now() < v_comment.created_at + interval '10 minutes'
    )
  ) then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.support_request_comments
  where id = p_comment_id;

  select created_at, author_role
    into v_latest_created_at, v_latest_author_role
  from public.support_request_comments
  where request_id = v_comment.request_id
  order by created_at desc
  limit 1;

  update public.support_requests
  set last_comment_at = v_latest_created_at,
      last_comment_by_role = v_latest_author_role,
      updated_at = now()
  where id = v_comment.request_id;

  return v_comment.request_id;
end;
$$;

revoke execute on function public.delete_support_comment(uuid) from public, anon;
grant execute on function public.delete_support_comment(uuid) to authenticated;

create or replace function public.cleanup_failed_support_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_req
  from public.support_requests
  where id = p_request_id
  for update;
  if not found then
    return;
  end if;

  if v_req.user_id <> auth.uid() or v_req.status <> 'open' then
    raise exception 'FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.support_request_comments c
    where c.request_id = p_request_id
  ) then
    raise exception 'HAS_COMMENTS';
  end if;

  delete from public.support_requests
  where id = p_request_id;
end;
$$;

revoke execute on function public.cleanup_failed_support_request(uuid) from public, anon;
grant execute on function public.cleanup_failed_support_request(uuid) to authenticated;
