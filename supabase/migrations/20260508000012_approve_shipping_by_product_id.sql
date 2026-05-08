-- Phase 1 안정화 (Codex P1, 2차):
-- approve_shipping_upload 의 product_code 매칭이 비결정적이라
-- products.name 중복 시 잘못된 상품 재고가 차감될 수 있음.
-- server action 이 업로드 시점에 product_id 를 캡처하므로 RPC 는 product_id 직접 사용.
-- legacy items 가드도 product_id 부재로 변경.

create or replace function public.approve_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_admin uuid := auth.uid();
  v_upload record;
  v_user record;
  v_row jsonb;
  v_product_id uuid;
  v_qty int;
  v_check record;
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

  -- legacy items 감지: 새 흐름은 server action 이 product_id 를 미리 채움.
  -- product_id 가 없는 행이 하나라도 있으면 옛 양식.
  if exists (
    select 1 from jsonb_array_elements(v_upload.items) as it
    where (it->>'product_id') is null
  ) then
    raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
  end if;

  -- 보유 재고 사전 검증 (product_id 직접 매칭, 결정적)
  for v_check in
    with rows as (
      select (it->>'product_id')::uuid as product_id,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
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
    if v_check.available < v_check.need_qty then
      raise exception 'INSUFFICIENT_INVENTORY:%:%:%',
        v_check.product_id, v_check.need_qty, v_check.available;
    end if;
  end loop;

  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 보유 재고 차감 — conditional UPDATE 로 동시 승인 race 직렬화.
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    v_product_id := (v_row->>'product_id')::uuid;
    if v_product_id is null then
      raise exception 'LEGACY_ITEMS_NOT_SUPPORTED';
    end if;

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
