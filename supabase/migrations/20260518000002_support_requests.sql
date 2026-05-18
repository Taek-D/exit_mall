-- ============================================================================
-- 교환/반품 및 CS 문의 (Support Requests) - private board with comments
-- ============================================================================

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('exchange','return','cs','other')),
  title text not null check (length(title) between 1 and 200),
  body text not null check (length(body) between 1 and 5000),
  reference_type text not null default 'none' check (reference_type in ('none','order','tracking','other')),
  reference_value text check (reference_value is null or length(reference_value) <= 100),
  status text not null default 'open' check (status in ('open','in_progress','completed','cancelled')),
  last_comment_at timestamptz,
  last_comment_by_role text check (last_comment_by_role in ('user','admin')),
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_requests_user_idx on public.support_requests (user_id, created_at desc);
create index support_requests_status_idx on public.support_requests (status, created_at desc);
create index support_requests_category_idx on public.support_requests (category, created_at desc);
create index support_requests_updated_idx on public.support_requests (updated_at desc);

create table public.support_request_comments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  author_role text not null check (author_role in ('user','admin')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index support_comments_request_idx on public.support_request_comments (request_id, created_at);

create or replace function public.support_comments_pin_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
    return NEW;
  end if;

  NEW.id := OLD.id;
  NEW.author_id := OLD.author_id;
  NEW.author_role := OLD.author_role;
  NEW.request_id := OLD.request_id;
  NEW.created_at := OLD.created_at;
  NEW.deleted_at := OLD.deleted_at;
  return NEW;
end;
$$;

drop trigger if exists support_comments_pin_columns_trg on public.support_request_comments;
create trigger support_comments_pin_columns_trg
  before update on public.support_request_comments
  for each row execute function public.support_comments_pin_columns();

revoke execute on function public.support_comments_pin_columns() from public, anon, authenticated;

create table public.support_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now(),
  unique (storage_path)
);

create index support_attachments_request_idx on public.support_request_attachments (request_id, created_at);

create or replace function public.support_attachments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
  v_count integer;
begin
  select * into v_req
  from public.support_requests
  where id = NEW.request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if NEW.user_id <> v_req.user_id then
    raise exception 'INVALID_ATTACHMENT_OWNER';
  end if;

  if NEW.storage_path not like (NEW.user_id::text || '/' || NEW.request_id::text || '/attachments/%') then
    raise exception 'INVALID_ATTACHMENT_PATH';
  end if;

  select count(*) into v_count
  from public.support_request_attachments
  where request_id = NEW.request_id;

  if v_count >= 5 then
    raise exception 'TOO_MANY_ATTACHMENTS';
  end if;

  return NEW;
end;
$$;

drop trigger if exists support_attachments_before_insert_trg on public.support_request_attachments;
create trigger support_attachments_before_insert_trg
  before insert on public.support_request_attachments
  for each row execute function public.support_attachments_before_insert();

revoke execute on function public.support_attachments_before_insert() from public, anon, authenticated;

alter table public.support_requests enable row level security;
alter table public.support_request_comments enable row level security;
alter table public.support_request_attachments enable row level security;

create policy support_requests_owner_admin_select on public.support_requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy support_requests_self_delete on public.support_requests
  for delete using (
    user_id = (select auth.uid())
    and status = 'open'
    and not exists (
      select 1 from public.support_request_comments c
      where c.request_id = support_requests.id
    )
    and not exists (
      select 1 from public.support_request_attachments a
      where a.request_id = support_requests.id
    )
  );

create policy support_requests_admin_all on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

create policy support_comments_select on public.support_request_comments
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_comments_self_update on public.support_request_comments
  for update using (
    author_id = auth.uid()
    and now() < created_at + interval '10 minutes'
  )
  with check (
    author_id = auth.uid()
    and now() < created_at + interval '10 minutes'
  );

create policy support_comments_self_delete on public.support_request_comments
  for delete using (
    author_id = auth.uid()
    and now() < created_at + interval '10 minutes'
  );

create policy support_comments_admin_all on public.support_request_comments
  for all using (public.is_admin()) with check (public.is_admin());

create policy support_attachments_select on public.support_request_attachments
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_attachments_owner_insert on public.support_request_attachments
  for insert with check (
    user_id = auth.uid()
    and public.is_active()
    and exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and r.user_id = auth.uid()
        and r.status = 'open'
    )
  );

create policy support_attachments_owner_delete on public.support_request_attachments
  for delete using (
    user_id = auth.uid()
    and exists (
      select 1 from public.support_requests r
      where r.id = request_id and r.status = 'open'
    )
  );

create policy support_attachments_admin_all on public.support_request_attachments
  for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values
  ('support-requests', 'support-requests', false)
  on conflict (id) do nothing;

create policy "support-requests owner read" on storage.objects
  for select using (
    bucket_id = 'support-requests'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin())
  );

create policy "support-requests owner write" on storage.objects
  for insert with check (
    bucket_id = 'support-requests'
    and auth.uid()::text = (storage.foldername(name))[1]
    and public.is_active()
  );

create policy "support-requests owner delete" on storage.objects
  for delete using (
    bucket_id = 'support-requests'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and not exists (
      select 1 from public.support_request_attachments a
      where a.storage_path = storage.objects.name
    )
  );

create policy "support-requests admin all" on storage.objects
  for all using (bucket_id = 'support-requests' and public.is_admin())
  with check (bucket_id = 'support-requests' and public.is_admin());

create or replace function public.submit_support_request_rpc(
  p_category text,
  p_title text,
  p_body text,
  p_reference_type text default 'none',
  p_reference_value text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null or not public.is_active() then
    raise exception 'FORBIDDEN';
  end if;
  if p_category is null or p_category not in ('exchange','return','cs','other') then
    raise exception 'INVALID_CATEGORY';
  end if;
  if coalesce(p_reference_type, 'none') not in ('none','order','tracking','other') then
    raise exception 'INVALID_REFERENCE_TYPE';
  end if;
  if length(trim(coalesce(p_title, ''))) < 1 or length(trim(p_title)) > 200 then
    raise exception 'INVALID_TITLE';
  end if;
  if length(trim(coalesce(p_body, ''))) < 1 or length(trim(p_body)) > 5000 then
    raise exception 'INVALID_BODY';
  end if;
  if p_reference_value is not null and length(trim(p_reference_value)) > 100 then
    raise exception 'INVALID_REFERENCE';
  end if;

  perform public.rate_limit_check('support_request_create', 5, 60);

  insert into public.support_requests (
    user_id, category, title, body, reference_type, reference_value, user_last_read_at
  ) values (
    v_user,
    p_category,
    trim(p_title),
    trim(p_body),
    coalesce(p_reference_type, 'none'),
    nullif(trim(coalesce(p_reference_value, '')), ''),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.submit_support_request_rpc(text, text, text, text, text) from public, anon;
grant execute on function public.submit_support_request_rpc(text, text, text, text, text) to authenticated;

create or replace function public.set_support_status(
  p_request_id uuid,
  p_new_status text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_req from public.support_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if not (
    (v_req.status = 'open' and p_new_status in ('in_progress','cancelled'))
    or (v_req.status = 'in_progress' and p_new_status in ('completed','cancelled'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.support_requests
  set status = p_new_status,
      reviewed_by = auth.uid(),
      updated_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.set_support_status(uuid, text) from public, anon;
grant execute on function public.set_support_status(uuid, text) to authenticated;

create or replace function public.cancel_support_request(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  select * into v_req from public.support_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if public.is_admin() then
    if v_req.status not in ('open','in_progress') then
      raise exception 'NOT_CANCELLABLE';
    end if;
  elsif v_req.user_id = auth.uid() then
    if v_req.status <> 'open' then
      raise exception 'NOT_CANCELLABLE';
    end if;
  else
    raise exception 'FORBIDDEN';
  end if;

  update public.support_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

revoke execute on function public.cancel_support_request(uuid) from public, anon;
grant execute on function public.cancel_support_request(uuid) to authenticated;

create or replace function public.mark_support_read(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
begin
  select * into v_req from public.support_requests where id = p_request_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if public.is_admin() then
    if v_req.last_comment_at is not null
       and (
         v_req.admin_last_read_at is null
         or v_req.last_comment_at > v_req.admin_last_read_at
       ) then
      update public.support_requests
      set admin_last_read_at = v_req.last_comment_at
      where id = p_request_id
        and (
          admin_last_read_at is null
          or admin_last_read_at < v_req.last_comment_at
        );
    end if;
  elsif v_req.user_id = auth.uid() then
    if v_req.last_comment_at is not null
       and (
         v_req.user_last_read_at is null
         or v_req.last_comment_at > v_req.user_last_read_at
       ) then
      update public.support_requests
      set user_last_read_at = v_req.last_comment_at
      where id = p_request_id
        and (
          user_last_read_at is null
          or user_last_read_at < v_req.last_comment_at
        );
    end if;
  else
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

revoke execute on function public.mark_support_read(uuid) from public, anon;
grant execute on function public.mark_support_read(uuid) to authenticated;

create or replace function public.add_support_comment(
  p_request_id uuid,
  p_body text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
  v_role text;
  v_comment_id uuid;
begin
  if auth.uid() is null or length(trim(coalesce(p_body, ''))) < 1 or length(trim(p_body)) > 2000 then
    raise exception 'INVALID_BODY';
  end if;

  select * into v_req from public.support_requests where id = p_request_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_req.status in ('completed','cancelled') then
    raise exception 'LOCKED';
  end if;

  if public.is_admin() then
    v_role := 'admin';
  elsif v_req.user_id = auth.uid() and public.is_active() then
    v_role := 'user';
  else
    raise exception 'FORBIDDEN';
  end if;

  perform public.rate_limit_check('support_comment', 20, 60);

  insert into public.support_request_comments (request_id, author_id, author_role, body)
  values (p_request_id, auth.uid(), v_role, trim(p_body))
  returning id into v_comment_id;

  update public.support_requests
  set last_comment_at = now(),
      last_comment_by_role = v_role,
      updated_at = now()
  where id = p_request_id;

  return v_comment_id;
end;
$$;

revoke execute on function public.add_support_comment(uuid, text) from public, anon;
grant execute on function public.add_support_comment(uuid, text) to authenticated;

create or replace function public.count_support_unread(
  p_role text
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_role = 'admin' then
    if not public.is_admin() then
      raise exception 'FORBIDDEN';
    end if;
    return (
      select count(*)::integer
      from public.support_requests
      where last_comment_by_role = 'user'
        and last_comment_at > coalesce(admin_last_read_at, 'epoch'::timestamptz)
    );
  end if;

  return (
    select count(*)::integer
    from public.support_requests
    where user_id = auth.uid()
      and last_comment_by_role = 'admin'
      and last_comment_at > coalesce(user_last_read_at, 'epoch'::timestamptz)
  );
end;
$$;

revoke execute on function public.count_support_unread(text) from public, anon;
grant execute on function public.count_support_unread(text) to authenticated;

create or replace function public.search_support_requests(
  p_q text default null,
  p_status text default null,
  p_category text default null,
  p_limit integer default 100
) returns table (
  id uuid,
  user_id uuid,
  category text,
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
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select
    r.id,
    r.user_id,
    r.category,
    r.title,
    r.status,
    r.last_comment_at,
    r.last_comment_by_role,
    r.user_last_read_at,
    r.admin_last_read_at,
    r.created_at,
    r.updated_at,
    p.name as profile_name,
    p.email as profile_email
  from public.support_requests r
  join public.profiles p on p.id = r.user_id
  where (p_status is null or r.status = p_status)
    and (p_category is null or r.category = p_category)
    and (
      p_q is null
      or lower(r.title) like '%' || lower(p_q) || '%'
      or lower(p.name) like '%' || lower(p_q) || '%'
      or lower(p.email) like '%' || lower(p_q) || '%'
    )
  order by r.updated_at desc, r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke execute on function public.search_support_requests(text, text, text, integer) from public, anon;
grant execute on function public.search_support_requests(text, text, text, integer) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.support_requests;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.support_request_comments;
  exception when duplicate_object then
    null;
  end;
end $$;
