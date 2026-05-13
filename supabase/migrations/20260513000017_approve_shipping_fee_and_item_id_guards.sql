-- approve_shipping_upload P1 hardening (codex review):
-- (1) item 에 product_id 와 custom_inventory_id 가 동시에 있으면 명시적 거부
--     - server action 은 정확히 하나만 채우지만, order_uploads INSERT 가 user 본인에게 RLS 로 허용되므로
--       조작된 items 가 들어올 가능성을 DB 레이어에서 차단.
-- (2) shipping_fee_total 을 신뢰하지 말고 server-side 에서 재계산.
--     - jsonb_array_length(items) * 3300 와 다르면 INVALID_FEE 로 거부.
--     - 사용자가 낮은 fee 를 적어 INSERT 후 승인되어 undercharged 되는 시나리오 차단.

create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_custom_id uuid;
  v_qty int;
  v_pcheck record;
  v_ccheck record;
  v_expected_fee bigint;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;

  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  select id, status, deposit_balance into v_user
    from public.profiles where id = v_upload.user_id for update;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if v_user.status <> 'active' then raise exception 'USER_NOT_ACTIVE'; end if;

  if jsonb_array_length(v_upload.items) = 0 then raise exception 'EMPTY_ITEMS'; end if;

  -- (1) 한 행에 product_id 와 custom_inventory_id 가 둘 다 있으면 명시적 거부
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is not null
      and (it->>'custom_inventory_id') is not null
  ) then
    raise exception 'INVALID_ITEM_BOTH_IDS';
  end if;

  -- legacy 감지: 둘 다 없는 행
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null and (it->>'custom_inventory_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- (2) 배송비 재검증 — server 신뢰값으로 재계산
  -- 3300 은 SHIPPING_FEE_PER_ROW 와 동기화 (lib/shipping-upload-parser.ts).
  v_expected_fee := jsonb_array_length(v_upload.items)::bigint * 3300;
  if v_upload.shipping_fee_total <> v_expected_fee then
    raise exception 'INVALID_FEE:%:%', v_upload.shipping_fee_total, v_expected_fee;
  end if;

  -- 사전 검증: product 합산
  for v_pcheck in
    with rows as (
      select (it->>'product_id')::uuid as product_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'product_id') is not null
    ),
    by_product as (
      select product_id, sum(quantity)::int as need_qty
      from rows group by product_id
    )
    select bp.product_id, bp.need_qty,
           coalesce(ui.quantity, 0) as available
    from by_product bp
    left join public.user_inventory ui
      on ui.user_id = v_upload.user_id and ui.product_id = bp.product_id
  loop
    if v_pcheck.available < v_pcheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_pcheck.product_id, v_pcheck.need_qty, v_pcheck.available;
    end if;
  end loop;

  -- 사전 검증: custom 합산
  for v_ccheck in
    with rows as (
      select (it->>'custom_inventory_id')::uuid as custom_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
      where (it->>'custom_inventory_id') is not null
    ),
    by_custom as (
      select custom_id, sum(quantity)::int as need_qty
      from rows group by custom_id
    )
    select bc.custom_id, bc.need_qty,
           coalesce(uci.quantity, 0) as available
    from by_custom bc
    left join public.user_custom_inventory uci
      on uci.user_id = v_upload.user_id and uci.id = bc.custom_id
  loop
    if v_ccheck.available < v_ccheck.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_ccheck.custom_id, v_ccheck.need_qty, v_ccheck.available;
    end if;
  end loop;

  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 차감 — 행별로 product 또는 custom 분기
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := nullif(v_row->>'product_id', '')::uuid;
    v_custom_id := nullif(v_row->>'custom_inventory_id', '')::uuid;

    if v_product_id is not null then
      update public.user_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and product_id = v_product_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_product_id, v_qty,
          coalesce((select quantity from public.user_inventory
                    where user_id = v_upload.user_id and product_id = v_product_id), 0);
      end if;
      insert into public.inventory_movements
        (user_id, product_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_product_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    elsif v_custom_id is not null then
      update public.user_custom_inventory
        set quantity = quantity - v_qty, updated_at = now()
        where user_id = v_upload.user_id
          and id = v_custom_id
          and quantity >= v_qty;
      if not found then
        raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
          v_custom_id, v_qty,
          coalesce((select quantity from public.user_custom_inventory
                    where user_id = v_upload.user_id and id = v_custom_id), 0);
      end if;
      insert into public.custom_inventory_movements
        (user_id, custom_inventory_id, delta, source_type, source_id)
      values
        (v_upload.user_id, v_custom_id, -v_qty, 'shipping_upload_approved', v_upload.id);

    else
      raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
    end if;
  end loop;

  -- 배송비 차감
  update public.profiles set deposit_balance = deposit_balance - v_upload.shipping_fee_total
    where id = v_user.id;

  insert into public.balance_transactions
    (user_id, type, amount, balance_after, ref_type, ref_id, admin_id, memo)
  values
    (v_user.id, 'order', -v_upload.shipping_fee_total,
     v_user.deposit_balance - v_upload.shipping_fee_total,
     'shipping_upload', v_upload.id, v_admin, '배송대행 승인 (배송비)');

  update public.order_uploads
    set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.approve_shipping_upload(uuid) to authenticated;
