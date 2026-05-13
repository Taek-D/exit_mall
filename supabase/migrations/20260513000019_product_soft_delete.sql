-- Product soft delete support.
-- Keeps inventory, movement, and order history intact while hiding products
-- from normal catalog/listing flows.

alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists products_deleted_at_idx
  on public.products (deleted_at);

drop policy if exists products_active_read on public.products;
create policy products_active_read on public.products
  for select using (
    public.is_admin()
    or (is_active = true and deleted_at is null)
  );

create or replace function public.apply_product_import(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_existing_id uuid;
  v_existing_deleted boolean;
  v_name_match_count int;
  v_name text;
  v_import_key text;
  v_description text;
  v_image_url text;
  v_price bigint;
  v_created int := 0;
  v_updated int := 0;
  v_restored int := 0;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;

  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'INVALID_ROWS';
  end if;

  for v_row in select value from jsonb_array_elements(rows)
  loop
    v_existing_id := null;
    v_existing_deleted := false;
    v_name_match_count := 0;
    v_name := nullif(btrim(v_row->>'name'), '');
    v_import_key := nullif(btrim(v_row->>'import_key'), '');
    v_description := nullif(v_row->>'description', '');
    v_image_url := nullif(v_row->>'image_url', '');
    v_price := nullif(v_row->>'price', '')::bigint;

    if v_name is null then
      raise exception 'INVALID_NAME';
    end if;

    if v_import_key is null then
      raise exception 'INVALID_IMPORT_KEY:%', v_name;
    end if;

    if v_price is null or v_price < 0 then
      raise exception 'INVALID_PRICE:%', v_name;
    end if;

    if nullif(v_row->>'product_id', '') is not null then
      select id, deleted_at is not null
        into v_existing_id, v_existing_deleted
      from public.products
      where id = (v_row->>'product_id')::uuid;

      if v_existing_id is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_name;
      end if;
    else
      select id, deleted_at is not null
        into v_existing_id, v_existing_deleted
      from public.products
      where import_key = v_import_key;
    end if;

    if v_existing_id is null then
      select count(*), min(id::text)::uuid
        into v_name_match_count, v_existing_id
      from public.products
      where name = v_name;

      if v_name_match_count > 1 then
        raise exception 'AMBIGUOUS_PRODUCT_NAME:%', v_name;
      end if;

      if v_name_match_count = 0 then
        v_existing_id := null;
      else
        select deleted_at is not null
          into v_existing_deleted
        from public.products
        where id = v_existing_id;
      end if;
    end if;

    if v_existing_id is null then
      insert into public.products (
        name,
        description,
        price,
        image_url,
        stock,
        is_active,
        per_user_limit,
        brand,
        option_name,
        management_code,
        category,
        barcode,
        import_key,
        last_imported_at
      )
      values (
        v_name,
        coalesce(v_description, ''),
        v_price,
        v_image_url,
        -1,
        false,
        null,
        nullif(v_row->>'brand', ''),
        nullif(v_row->>'option_name', ''),
        nullif(v_row->>'management_code', ''),
        nullif(v_row->>'category', ''),
        nullif(v_row->>'barcode', ''),
        v_import_key,
        now()
      );

      v_created := v_created + 1;
    else
      update public.products
      set
        name = v_name,
        description = coalesce(v_description, description),
        price = v_price,
        image_url = coalesce(v_image_url, image_url),
        brand = nullif(v_row->>'brand', ''),
        option_name = nullif(v_row->>'option_name', ''),
        management_code = nullif(v_row->>'management_code', ''),
        category = nullif(v_row->>'category', ''),
        barcode = nullif(v_row->>'barcode', ''),
        import_key = v_import_key,
        last_imported_at = now(),
        deleted_at = null,
        deleted_by = null
      where id = v_existing_id;

      if v_existing_deleted then
        v_restored := v_restored + 1;
      else
        v_updated := v_updated + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'restored', v_restored
  );
end;
$$;

grant execute on function public.apply_product_import(jsonb) to authenticated;
