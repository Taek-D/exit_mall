-- Add one private image attachment to admin-authored support comments.

create table if not exists public.support_request_comment_images (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null unique references public.support_request_comments(id) on delete cascade,
  request_id uuid not null references public.support_requests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (length(original_name) between 1 and 255),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);

create index if not exists support_comment_images_request_idx
  on public.support_request_comment_images (request_id, created_at);

create or replace function public.support_comment_images_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.support_request_comments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_comment
  from public.support_request_comments
  where id = NEW.comment_id
  for update;

  if not found then
    raise exception 'COMMENT_NOT_FOUND';
  end if;

  if v_comment.author_role <> 'admin' then
    raise exception 'COMMENT_IMAGE_ADMIN_ONLY';
  end if;

  if NEW.request_id <> v_comment.request_id then
    raise exception 'INVALID_COMMENT_IMAGE_REQUEST';
  end if;

  if NEW.user_id <> v_comment.author_id or NEW.user_id <> auth.uid() then
    raise exception 'INVALID_COMMENT_IMAGE_OWNER';
  end if;

  if NEW.storage_path not like (NEW.user_id::text || '/' || NEW.request_id::text || '/comments/' || NEW.comment_id::text || '/%') then
    raise exception 'INVALID_COMMENT_IMAGE_PATH';
  end if;

  return NEW;
end;
$$;

drop trigger if exists support_comment_images_before_insert_trg
  on public.support_request_comment_images;
create trigger support_comment_images_before_insert_trg
  before insert on public.support_request_comment_images
  for each row execute function public.support_comment_images_before_insert();

revoke execute on function public.support_comment_images_before_insert() from public, anon, authenticated;

alter table public.support_request_comment_images enable row level security;

create policy support_comment_images_select on public.support_request_comment_images
  for select using (
    exists (
      select 1 from public.support_requests r
      where r.id = request_id
        and (r.user_id = auth.uid() or public.is_admin())
    )
  );

create policy support_comment_images_admin_all on public.support_request_comment_images
  for all using (public.is_admin()) with check (public.is_admin());

drop function if exists public.add_support_comment(uuid, text);

create or replace function public.add_support_comment(
  p_request_id uuid,
  p_body text,
  p_has_image boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_req public.support_requests%rowtype;
  v_role text;
  v_comment_id uuid;
  v_body text := trim(coalesce(p_body, ''));
begin
  if auth.uid() is null then
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

  if length(v_body) > 2000 then
    raise exception 'INVALID_BODY';
  end if;

  if length(v_body) < 1 and not (v_role = 'admin' and coalesce(p_has_image, false)) then
    raise exception 'INVALID_BODY';
  end if;

  perform public.rate_limit_check('support_comment', 20, 60);

  insert into public.support_request_comments (request_id, author_id, author_role, body)
  values (p_request_id, auth.uid(), v_role, v_body)
  returning id into v_comment_id;

  update public.support_requests
  set last_comment_at = now(),
      last_comment_by_role = v_role,
      updated_at = now()
  where id = p_request_id;

  return v_comment_id;
end;
$$;

revoke execute on function public.add_support_comment(uuid, text, boolean) from public, anon;
grant execute on function public.add_support_comment(uuid, text, boolean) to authenticated;
