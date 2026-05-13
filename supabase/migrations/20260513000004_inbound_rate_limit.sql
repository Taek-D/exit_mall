-- ============================================================================
-- Inbound rate limits + RPC chokepoint for submit
--   - add_inbound_comment: 20/min, admin bypasses
--   - submit_inbound_request_rpc: 5/min, all users (incl. admin)
--   - inbound_requests_self_insert: lockdown — direct insert blocked,
--     only the RPC (which sets app.inbound_rpc=true) can insert.
-- ============================================================================

create or replace function public.add_inbound_comment(
  request_id uuid,
  body text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean := public.is_admin();
  v_req record;
  v_role text;
  v_id uuid;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;
  if length(body) < 1 or length(body) > 2000 then raise exception 'INVALID_BODY'; end if;

  -- 분당 20건. Admin bypasses to triage quickly.
  if not v_is_admin then
    perform public.rate_limit_check('inbound_comment', 20, 60);
  end if;

  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;
  if v_req.status in ('completed','cancelled') then raise exception 'LOCKED'; end if;

  if v_is_admin then
    v_role := 'admin';
  elsif v_req.user_id = v_uid then
    v_role := 'user';
  else
    raise exception 'FORBIDDEN';
  end if;

  insert into public.inbound_request_comments (request_id, author_id, author_role, body)
  values (request_id, v_uid, v_role, body)
  returning id into v_id;

  update public.inbound_requests
    set last_comment_at = now(),
        last_comment_by_role = v_role,
        updated_at = now()
    where id = request_id;

  return v_id;
end; $$;

create or replace function public.submit_inbound_request_rpc(
  p_title text,
  p_body text,
  p_excel_path text,
  p_excel_name text,
  p_image_paths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;
  if not public.is_active() then raise exception 'INACTIVE'; end if;

  perform public.rate_limit_check('inbound_request_create', 5, 60);

  if length(coalesce(p_title, '')) < 1 or length(p_title) > 200 then raise exception 'INVALID_TITLE'; end if;
  if length(coalesce(p_body, '')) > 5000 then raise exception 'INVALID_BODY'; end if;
  if p_image_paths is not null and cardinality(p_image_paths) > 3 then raise exception 'TOO_MANY_IMAGES'; end if;
  if p_excel_path is null or p_excel_name is null then raise exception 'MISSING_EXCEL'; end if;

  insert into public.inbound_requests (user_id, title, body, excel_storage_path, excel_original_name, image_paths)
  values (v_uid, p_title, p_body, p_excel_path, p_excel_name, coalesce(p_image_paths, '{}'::text[]))
  returning id into v_id;
  return v_id;
end; $$;

revoke execute on function public.submit_inbound_request_rpc(text, text, text, text, text[]) from public, anon;
grant execute on function public.submit_inbound_request_rpc(text, text, text, text, text[]) to authenticated;

-- RLS lockdown: direct inserts now fail unless inside an RPC that sets the flag.
drop policy if exists inbound_requests_self_insert on public.inbound_requests;
create policy inbound_requests_self_insert on public.inbound_requests
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    and coalesce(current_setting('app.inbound_rpc', true), '') = 'true'
  );
