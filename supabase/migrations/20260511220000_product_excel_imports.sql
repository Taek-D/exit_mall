-- Product Excel imports: additive schema only.

alter table public.products
  add column if not exists brand text,
  add column if not exists option_name text,
  add column if not exists management_code text,
  add column if not exists category text,
  add column if not exists barcode text,
  add column if not exists import_key text,
  add column if not exists last_imported_at timestamptz;

create unique index if not exists products_import_key_uidx
  on public.products (import_key)
  where import_key is not null;

create index if not exists products_management_code_idx
  on public.products (management_code)
  where management_code is not null;

create index if not exists products_barcode_idx
  on public.products (barcode)
  where barcode is not null;

create table if not exists public.product_imports (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  storage_path text not null,
  original_name text not null,
  status text not null default 'preview'
    check (status in ('preview', 'imported', 'failed')),
  preview jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

create index if not exists product_imports_admin_created_idx
  on public.product_imports (admin_id, created_at desc);

create index if not exists product_imports_status_created_idx
  on public.product_imports (status, created_at desc);

alter table public.product_imports enable row level security;

drop policy if exists product_imports_admin_all on public.product_imports;
create policy product_imports_admin_all on public.product_imports
  for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('product-imports', 'product-imports', false)
on conflict (id) do nothing;

drop policy if exists "product-imports admin read" on storage.objects;
create policy "product-imports admin read" on storage.objects
  for select using (bucket_id = 'product-imports' and public.is_admin());

drop policy if exists "product-imports admin write" on storage.objects;
create policy "product-imports admin write" on storage.objects
  for insert with check (bucket_id = 'product-imports' and public.is_admin());

drop policy if exists "product-imports admin update" on storage.objects;
create policy "product-imports admin update" on storage.objects
  for update using (bucket_id = 'product-imports' and public.is_admin())
  with check (bucket_id = 'product-imports' and public.is_admin());

drop policy if exists "product-imports admin delete" on storage.objects;
create policy "product-imports admin delete" on storage.objects
  for delete using (bucket_id = 'product-imports' and public.is_admin());

create or replace function public.apply_product_import(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_existing_id uuid;
  v_name_match_count int;
  v_name text;
  v_import_key text;
  v_description text;
  v_image_url text;
  v_price bigint;
  v_created int := 0;
  v_updated int := 0;
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
      select id into v_existing_id
      from public.products
      where id = (v_row->>'product_id')::uuid;

      if v_existing_id is null then
        raise exception 'PRODUCT_NOT_FOUND:%', v_name;
      end if;
    else
      select id into v_existing_id
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
        last_imported_at = now()
      where id = v_existing_id;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated);
end;
$$;

grant execute on function public.apply_product_import(jsonb) to authenticated;
