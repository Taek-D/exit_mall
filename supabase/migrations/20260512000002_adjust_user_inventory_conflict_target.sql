-- Fix plpgsql lint ambiguity in adjust_user_inventory without changing RPC arg names.
-- The product_id argument name is part of the Supabase RPC call shape.

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
  on conflict on constraint user_inventory_pkey do nothing;

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

  perform v_admin;
  perform memo;
end; $$;

grant execute on function public.adjust_user_inventory(uuid, uuid, int, text) to authenticated;
