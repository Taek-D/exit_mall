-- Phase 1 누락 보정: balance_transactions.ref_type 허용 값 확장.
-- approve_stock_order / approve_shipping_upload RPC가 'stock_order' / 'shipping_upload' 값을 INSERT한다.

alter table public.balance_transactions drop constraint if exists balance_transactions_ref_type_check;
alter table public.balance_transactions
  add constraint balance_transactions_ref_type_check
  check (ref_type in ('deposit_request','order','stock_order','shipping_upload'));
