-- Phase 1.5: shipping_upload RPCs — 새 양식 기반 발송 흐름.
-- request 는 server action 이 파일을 미리 파싱해서 items, shipping_fee_total 을 채워 INSERT 한다.
-- (RPC 가 아닌 server action 책임)

-- === RPC: approve_shipping_upload (admin only) ===
-- 보유 재고 -qty (모든 행 합산), 배송비 -shipping_fee_total, status=approved, movements 기록.
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

  -- 보유 재고 검증 (상품별 합산)
  for v_check in
    with rows as (
      select (it->>'product_code') as code,
             coalesce((it->>'quantity')::int, 0) as quantity
      from jsonb_array_elements(v_upload.items) as it
    ),
    by_product as (
      select p.id as product_id, sum(r.quantity)::int as need_qty
      from rows r
      join public.products p on p.name = r.code or p.id::text = r.code
      group by p.id
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

  -- 예치금 (배송비) 검증
  if v_user.deposit_balance < v_upload.shipping_fee_total then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  -- 보유 재고 차감 + movements 기록 (행 단위)
  for v_row in select * from jsonb_array_elements(v_upload.items) loop
    v_qty := coalesce((v_row->>'quantity')::int, 0);
    if v_qty < 1 then raise exception 'INVALID_QUANTITY'; end if;

    select id into v_product_id
      from public.products
      where name = (v_row->>'product_code') or id::text = (v_row->>'product_code')
      limit 1;
    if v_product_id is null then
      raise exception 'PRODUCT_NOT_FOUND:%', v_row->>'product_code';
    end if;

    update public.user_inventory
      set quantity = quantity - v_qty, updated_at = now()
      where user_id = v_upload.user_id and product_id = v_product_id;

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

-- === RPC: reject_shipping_upload (admin only) ===
create or replace function public.reject_shipping_upload(upload_id uuid, memo text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'pending' then raise exception 'ALREADY_PROCESSED'; end if;

  update public.order_uploads
    set status = 'rejected', admin_memo = memo,
        reviewed_by = auth.uid(), reviewed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.reject_shipping_upload(uuid, text) to authenticated;

-- === RPC: cancel_shipping_upload (owner, pending only) ===
create or replace function public.cancel_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if v_upload.status <> 'pending' then raise exception 'NOT_CANCELLABLE'; end if;

  update public.order_uploads set status = 'cancelled' where id = upload_id;
end; $$;

grant execute on function public.cancel_shipping_upload(uuid) to authenticated;

-- === RPC: attach_tracking (admin only) ===
-- 멱등 호출 가능. 행 수가 일치해야 하고, 비어있는 송장은 그대로 둔다(부분 발송 허용).
create or replace function public.attach_tracking(
  upload_id uuid,
  storage_path text,
  parsed_items jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status not in ('approved','shipped') then
    raise exception 'INVALID_STATE:%', v_upload.status;
  end if;

  if jsonb_array_length(v_upload.items) <> jsonb_array_length(parsed_items) then
    raise exception 'ROW_COUNT_MISMATCH:%:%',
      jsonb_array_length(v_upload.items), jsonb_array_length(parsed_items);
  end if;

  update public.order_uploads
    set items = parsed_items,
        admin_storage_path = storage_path,
        status = 'shipped',
        shipped_at = coalesce(shipped_at, now())
    where id = upload_id;
end; $$;

grant execute on function public.attach_tracking(uuid, text, jsonb) to authenticated;

-- === RPC: complete_shipping_upload (admin only) ===
create or replace function public.complete_shipping_upload(upload_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_upload record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into v_upload from public.order_uploads where id = upload_id for update;
  if v_upload is null then raise exception 'NOT_FOUND'; end if;
  if v_upload.status <> 'shipped' then raise exception 'INVALID_STATE:%', v_upload.status; end if;

  update public.order_uploads
    set status = 'completed', completed_at = now()
    where id = upload_id;
end; $$;

grant execute on function public.complete_shipping_upload(uuid) to authenticated;
