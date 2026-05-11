-- The production database was updated with CREATE INDEX CONCURRENTLY outside a
-- transaction. This migration records the desired schema for local/fresh DBs
-- and remains safe to re-run against production because every index is
-- idempotent.

create index if not exists app_settings_updated_by_idx
  on public.app_settings (updated_by);

create index if not exists balance_transactions_admin_id_idx
  on public.balance_transactions (admin_id);

create index if not exists deposit_requests_confirmed_by_idx
  on public.deposit_requests (confirmed_by);

create index if not exists order_items_product_id_idx
  on public.order_items (product_id);

create index if not exists order_uploads_order_id_idx
  on public.order_uploads (order_id);

create index if not exists order_uploads_reviewed_by_idx
  on public.order_uploads (reviewed_by);

create index if not exists stock_orders_reviewed_by_idx
  on public.stock_orders (reviewed_by);

create index if not exists user_inventory_product_id_idx
  on public.user_inventory (product_id);

-- Public image URLs do not require object listing permission. Keep admin
-- upload/update/delete policies, but remove broad public SELECT listing.
drop policy if exists "product-images read" on storage.objects;
