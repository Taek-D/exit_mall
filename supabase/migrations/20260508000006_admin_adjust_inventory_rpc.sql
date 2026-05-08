-- Phase 3.1: 관리자 보유 재고 수동 조정 RPC.
-- delta != 0. 음수 조정 시 quantity >= 0 보장.

create or replace function public.adjust_user_inventory(
  target_user uuid,
  product_id uuid,
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

  insert into public.user_inventory (user_id, product_id, quantity, updated_at)
  values (target_user, adjust_user_inventory.product_id, 0, now())
  on conflict (user_id, product_id) do nothing;

  select quantity into v_current
    from public.user_inventory ui
    where ui.user_id = target_user
      and ui.product_id = adjust_user_inventory.product_id
    for update;
  v_new := v_current + delta;
  if v_new < 0 then raise exception 'NEGATIVE_INVENTORY:%:%', v_current, delta; end if;

  update public.user_inventory ui
    set quantity = v_new, updated_at = now()
    where ui.user_id = target_user
      and ui.product_id = adjust_user_inventory.product_id;

  insert into public.inventory_movements
    (user_id, product_id, delta, source_type, source_id)
  values
    (target_user, adjust_user_inventory.product_id, delta, 'admin_adjust', null);

  -- v_admin 은 audit log 에 기록되지만, inventory_movements 는 admin_id 컬럼이 없어
  -- memo 와 함께 별도로 추적 필요. memo 는 향후 movements 확장 시 컬럼화.
  perform v_admin;
  perform memo;
end; $$;

grant execute on function public.adjust_user_inventory(uuid, uuid, int, text) to authenticated;
