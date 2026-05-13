-- "(이름 없음)" 버그 픽스:
-- 기존 products_active_read 정책이 is_active=true 만 허용해서,
-- 사용자가 보유 중인 상품이 비활성/품절되면 products(name) 조인이 null 이 된다.
-- 본인 user_inventory 와 연결된 상품은 활성 여부와 무관하게 SELECT 가능하도록 정책 추가.
-- RLS 는 PERMISSIVE 정책의 OR 합집합이므로 기존 정책은 손대지 않는다.

create policy products_select_owned_inventory on public.products
  for select using (
    exists (
      select 1 from public.user_inventory ui
      where ui.product_id = products.id
        and ui.user_id = (select auth.uid())
    )
  );
