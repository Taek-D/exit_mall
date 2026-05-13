-- 수기 보유재고: 추가
-- name 은 trim 후 저장. UNIQUE(user_id, name) 위반은 raise.
-- initial_qty 0 도 허용 (placeholder). 0 이 아니면 movement (admin_adjust) 한 줄 추가.
create or replace function public.add_user_custom_inventory(
  target_user uuid,
  name text,
  initial_qty int default 0,
  memo text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_name text := trim(name);
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if v_name is null or length(v_name) = 0 or length(v_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if initial_qty is null or initial_qty < 0 then
    raise exception 'INVALID_QUANTITY';
  end if;

  insert into public.user_custom_inventory (user_id, name, quantity, created_by)
  values (target_user, v_name, initial_qty, v_admin)
  returning id into v_id;

  if initial_qty > 0 then
    insert into public.custom_inventory_movements
      (user_id, custom_inventory_id, delta, source_type, source_id)
    values
      (target_user, v_id, initial_qty, 'admin_adjust', null);
  end if;

  perform memo;
  return v_id;
exception
  when unique_violation then
    raise exception 'DUPLICATE_NAME';
end; $$;

grant execute on function public.add_user_custom_inventory(uuid, text, int, text)
  to authenticated;

-- 수기 보유재고: 조정 (기존 adjust_user_inventory 와 동일 패턴)
create or replace function public.adjust_user_custom_inventory(
  target_user uuid,
  custom_id uuid,
  delta int,
  memo text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_current int;
  v_new int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if delta = 0 then raise exception 'ZERO_DELTA'; end if;

  select quantity into v_current
    from public.user_custom_inventory uci
    where uci.id = adjust_user_custom_inventory.custom_id
      and uci.user_id = target_user
    for update;

  if v_current is null then raise exception 'NOT_FOUND'; end if;

  v_new := v_current + delta;
  if v_new < 0 then raise exception 'NEGATIVE_INVENTORY:%:%', v_current, delta; end if;

  update public.user_custom_inventory uci
    set quantity = v_new, updated_at = now()
    where uci.id = adjust_user_custom_inventory.custom_id;

  insert into public.custom_inventory_movements
    (user_id, custom_inventory_id, delta, source_type, source_id)
  values
    (target_user, adjust_user_custom_inventory.custom_id, delta, 'admin_adjust', null);

  perform v_admin;
  perform memo;
end; $$;

grant execute on function public.adjust_user_custom_inventory(uuid, uuid, int, text)
  to authenticated;

-- 수기 보유재고: 삭제 (잔량 무관 hard delete + movement 한 줄)
create or replace function public.delete_user_custom_inventory(
  target_user uuid,
  custom_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_qty int;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select quantity into v_qty
    from public.user_custom_inventory uci
    where uci.id = delete_user_custom_inventory.custom_id
      and uci.user_id = target_user
    for update;
  if v_qty is null then raise exception 'NOT_FOUND'; end if;

  if v_qty <> 0 then
    insert into public.custom_inventory_movements
      (user_id, custom_inventory_id, delta, source_type, source_id)
    values
      (target_user, delete_user_custom_inventory.custom_id, -v_qty, 'admin_delete', null);
  end if;

  delete from public.user_custom_inventory uci
    where uci.id = delete_user_custom_inventory.custom_id;

  perform v_admin;
end; $$;

grant execute on function public.delete_user_custom_inventory(uuid, uuid)
  to authenticated;
