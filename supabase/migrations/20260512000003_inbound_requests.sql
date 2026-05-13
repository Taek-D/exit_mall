-- ============================================================================
-- 입고리스트 (Inbound Requests) — private board with comments
-- ============================================================================

-- === Table: inbound_requests ================================================
create table public.inbound_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 5000),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','cancelled')),
  excel_storage_path text not null,
  excel_original_name text not null,
  image_paths text[] not null default '{}'::text[]
    check (cardinality(image_paths) <= 3),
  last_comment_at timestamptz,
  last_comment_by_role text check (last_comment_by_role in ('user','admin')),
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inbound_requests_user_idx on public.inbound_requests (user_id, created_at desc);
create index inbound_requests_status_idx on public.inbound_requests (status, created_at desc);

-- === Table: inbound_request_comments ========================================
create table public.inbound_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.inbound_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index inbound_comments_request_idx on public.inbound_request_comments (request_id, created_at);

-- === RLS: inbound_requests ==================================================
alter table public.inbound_requests enable row level security;

create policy inbound_requests_owner_admin_select on public.inbound_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy inbound_requests_self_insert on public.inbound_requests
  for insert with check (user_id = auth.uid() and public.is_active());

create policy inbound_requests_self_update on public.inbound_requests
  for update using (user_id = auth.uid() and status = 'open')
  with check (user_id = auth.uid() and status = 'open');

create policy inbound_requests_self_delete on public.inbound_requests
  for delete using (user_id = auth.uid() and status = 'open');

create policy inbound_requests_admin_all on public.inbound_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- === RLS: inbound_request_comments ==========================================
alter table public.inbound_request_comments enable row level security;

create policy inbound_comments_select on public.inbound_request_comments
  for select using (
    exists (
      select 1 from public.inbound_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

-- Direct insert is blocked; all comment inserts must go through add_inbound_comment RPC.

create policy inbound_comments_self_update on public.inbound_request_comments
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy inbound_comments_self_delete on public.inbound_request_comments
  for delete using (author_id = auth.uid());

create policy inbound_comments_admin_all on public.inbound_request_comments
  for all using (public.is_admin()) with check (public.is_admin());

-- === Storage bucket =========================================================
insert into storage.buckets (id, name, public) values
  ('inbound-requests', 'inbound-requests', false)
  on conflict (id) do nothing;

create policy "inbound-requests owner read" on storage.objects
  for select using (
    bucket_id = 'inbound-requests'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "inbound-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

create policy "inbound-requests owner update" on storage.objects
  for update using (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "inbound-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'inbound-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "inbound-requests admin all" on storage.objects
  for all using (bucket_id = 'inbound-requests' and public.is_admin())
  with check (bucket_id = 'inbound-requests' and public.is_admin());

-- === RPC: set_inbound_status (admin) ========================================
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

grant execute on function public.set_inbound_status(uuid, text) to authenticated;

-- === RPC: cancel_inbound_request ============================================
create or replace function public.cancel_inbound_request(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record;
begin
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

grant execute on function public.cancel_inbound_request(uuid) to authenticated;

-- === RPC: mark_inbound_read =================================================
create or replace function public.mark_inbound_read(request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req record; v_is_admin boolean := public.is_admin();
begin
  select * into v_req from public.inbound_requests where id = request_id;
  if v_req is null then raise exception 'NOT_FOUND'; end if;

  if v_is_admin then
    update public.inbound_requests set admin_last_read_at = now() where id = request_id;
  elsif v_req.user_id = auth.uid() then
    update public.inbound_requests set user_last_read_at = now() where id = request_id;
  else
    raise exception 'FORBIDDEN';
  end if;
end; $$;

grant execute on function public.mark_inbound_read(uuid) to authenticated;

-- === RPC: add_inbound_comment ===============================================
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

grant execute on function public.add_inbound_comment(uuid, text) to authenticated;

-- === Realtime ===============================================================
alter publication supabase_realtime add table public.inbound_requests;
alter publication supabase_realtime add table public.inbound_request_comments;
