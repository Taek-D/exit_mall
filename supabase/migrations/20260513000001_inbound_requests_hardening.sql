-- ============================================================================
-- 입고리스트 하드닝
--   1) Column-pinning triggers (CRITICAL + HIGH-3): 작성자가 author_role,
--      메타데이터 컬럼을 직접 변조하지 못하도록 보호. RPC 는 세션 플래그
--      `app.inbound_rpc=true` 로 명시적으로 바이패스.
--   2) count_inbound_unread(role) (HIGH-1): 풀테이블 스캔 → 단일 count.
--   3) mark_inbound_read 개선 (HIGH-2): 이미 최신 상태면 no-op 하여
--      페이지 새로고침 시 last_comment_at 이후 도착한 댓글이 lost-unread
--      처리되는 race 를 줄임.
-- ============================================================================

-- === 1) Column-pinning: inbound_request_comments ============================
create or replace function public.inbound_comments_pin_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return NEW; end if;
  -- author_id / author_role / request_id 는 작성 후 변경 불가
  NEW.author_id := OLD.author_id;
  NEW.author_role := OLD.author_role;
  NEW.request_id := OLD.request_id;
  NEW.created_at := OLD.created_at;
  return NEW;
end; $$;

drop trigger if exists inbound_comments_pin_columns_trg on public.inbound_request_comments;
create trigger inbound_comments_pin_columns_trg
  before update on public.inbound_request_comments
  for each row execute function public.inbound_comments_pin_columns();

-- === 1) Column-pinning: inbound_requests ====================================
create or replace function public.inbound_requests_pin_columns()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return NEW; end if;
  -- RPC 는 명시 플래그로 바이패스
  if coalesce(current_setting('app.inbound_rpc', true), '') = 'true' then
    return NEW;
  end if;
  -- 작성자가 RLS update 정책으로 직접 수정 시 — title/body 만 변경 허용
  NEW.user_id := OLD.user_id;
  NEW.status := OLD.status;
  NEW.excel_storage_path := OLD.excel_storage_path;
  NEW.excel_original_name := OLD.excel_original_name;
  NEW.image_paths := OLD.image_paths;
  NEW.last_comment_at := OLD.last_comment_at;
  NEW.last_comment_by_role := OLD.last_comment_by_role;
  NEW.user_last_read_at := OLD.user_last_read_at;
  NEW.admin_last_read_at := OLD.admin_last_read_at;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.created_at := OLD.created_at;
  return NEW;
end; $$;

drop trigger if exists inbound_requests_pin_columns_trg on public.inbound_requests;
create trigger inbound_requests_pin_columns_trg
  before update on public.inbound_requests
  for each row execute function public.inbound_requests_pin_columns();

-- === 2) HIGH-1: SQL count function for unread =================================
create or replace function public.count_inbound_unread(p_role text)
returns int
language sql stable security definer set search_path = public as $$
  with rows as (
    select last_comment_at, last_comment_by_role,
           user_last_read_at, admin_last_read_at, user_id
    from public.inbound_requests
    where last_comment_at is not null
  )
  select count(*)::int
  from rows
  where case
    when p_role = 'user'
      then last_comment_by_role = 'admin'
        and user_id = auth.uid()
        and (user_last_read_at is null or last_comment_at > user_last_read_at)
    when p_role = 'admin'
      then last_comment_by_role = 'user'
        and public.is_admin()
        and (admin_last_read_at is null or last_comment_at > admin_last_read_at)
    else false
  end;
$$;

grant execute on function public.count_inbound_unread(text) to authenticated;

-- === 3) HIGH-2: idempotent mark_inbound_read + race-aware =====================
-- 작성자/관리자가 상세 페이지에 진입할 때만 호출. 이미 최신이면 no-op.
-- 또한 read marker 가 last_comment_at 보다 뒤로 가지 않도록 보장.
create or replace function public.mark_inbound_read(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record; v_is_admin boolean := public.is_admin();
begin
  perform set_config('app.inbound_rpc', 'true', true);
  select * into v_req from public.inbound_requests where id = request_id;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  if v_is_admin then
    if v_req.admin_last_read_at is null
       or v_req.last_comment_at is null
       or v_req.last_comment_at > v_req.admin_last_read_at then
      update public.inbound_requests
        set admin_last_read_at = coalesce(v_req.last_comment_at, now())
        where id = request_id;
    end if;
  elsif v_req.user_id = auth.uid() then
    if v_req.user_last_read_at is null
       or v_req.last_comment_at is null
       or v_req.last_comment_at > v_req.user_last_read_at then
      update public.inbound_requests
        set user_last_read_at = coalesce(v_req.last_comment_at, now())
        where id = request_id;
    end if;
  else
    raise exception 'FORBIDDEN';
  end if;
end; $$;

-- === RPC 들에 bypass 플래그 추가 ===============================================
create or replace function public.set_inbound_status(
  request_id uuid,
  new_status text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_req record;
  v_allowed boolean := false;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  v_allowed := case
    when v_req.status = 'open' and new_status in ('in_progress','cancelled') then true
    when v_req.status = 'in_progress' and new_status in ('completed','cancelled') then true
    else false
  end;
  if not v_allowed then raise exception 'INVALID_TRANSITION'; end if;

  update public.inbound_requests
    set status = new_status,
        reviewed_by = case when new_status in ('completed','cancelled') then v_admin else reviewed_by end,
        updated_at = now()
    where id = request_id;
end; $$;

create or replace function public.cancel_inbound_request(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
  perform set_config('app.inbound_rpc', 'true', true);
  select * into v_req from public.inbound_requests where id = request_id for update;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  if public.is_admin() then
    if v_req.status in ('completed','cancelled') then raise exception 'ALREADY_CLOSED'; end if;
  else
    if v_req.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
    if v_req.status <> 'open' then raise exception 'NOT_CANCELLABLE'; end if;
  end if;

  update public.inbound_requests
    set status = 'cancelled', updated_at = now()
    where id = request_id;
end; $$;

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
