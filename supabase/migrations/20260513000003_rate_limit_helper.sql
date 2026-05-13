-- ============================================================================
-- Generic per-user rate-limit helper
--   - rate_limits table tracks one row per action call
--   - rate_limit_check raises 'RATE_LIMITED' when over window quota
--   - Amortized GC inside the function keeps the table bounded without a scheduler
-- ============================================================================

create table public.rate_limits (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  occurred_at timestamptz not null default now()
);
create index rate_limits_user_action_idx
  on public.rate_limits (user_id, action, occurred_at desc);

alter table public.rate_limits enable row level security;

create policy rate_limits_admin_all on public.rate_limits
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.rate_limit_check(
  p_action text,
  p_limit int,
  p_window_seconds int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then raise exception 'UNAUTHENTICATED'; end if;

  select count(*) into v_count
    from public.rate_limits
   where user_id = v_uid
     and action = p_action
     and occurred_at > now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.rate_limits (user_id, action) values (v_uid, p_action);

  -- Amortized GC: ~1% of calls clean rows older than 1 day. Bounded table size
  -- without a scheduler. Cheap because the index covers (user_id, action, occurred_at desc).
  if random() < 0.01 then
    delete from public.rate_limits where occurred_at < now() - interval '1 day';
  end if;
end; $$;

revoke execute on function public.rate_limit_check(text, int, int) from public, anon;
grant execute on function public.rate_limit_check(text, int, int) to authenticated;
