-- 로컬 개발·검수용 시드.
--
-- 목적은 "그럴듯한 데이터"가 아니라 "운영과 같은 길이 분포"다. 시드 값이
-- 짧으면 표의 열 폭 경쟁이 일어나지 않아, 운영에서 한글이 한 글자씩 접히는
-- 문제를 로컬에서 재현할 수 없다(2026-08 입고요청 송장번호 작업에서 실제로
-- 두 번 놓쳤다). 아래 길이는 2026-08 운영 데이터에서 측정한 값이다.
--
--   입고 상품명   평균 19 · 상위5% 34 · 최대 59
--   입고 옵션명   평균  5 · 상위5% 18 · 최대 41
--   배송대행 주소        상위5% 60 · 최대 106
--   배송대행 받는사람              최대 40
--   입고요청 제목 평균 15 · 상위5% 28 · 최대 200
--   한 업로드 행수                 최대 306
--
-- 개인정보는 들어가지 않는다. 이름·주소·연락처·이메일은 전부 생성값이다.
--
-- 사용법: supabase db reset (이 파일이 자동으로 실행된다)
-- 로그인 비밀번호는 모두 Local-Seed-2026!

begin;

-- === 계정 =================================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.admin@example.com',
   crypt('Local-Seed-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"시드관리자"}'::jsonb, now(), now()),
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.group1@example.com',
   crypt('Local-Seed-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"시드상사"}'::jsonb, now(), now()),
  -- 고객명 최대 길이(14자) 케이스. 목록의 작성자 열을 압박한다.
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.longname@example.com',
   crypt('Local-Seed-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"주식회사시드글로벌커머스"}'::jsonb, now(), now()),
  ('00000000-0000-4000-a000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'seed.group2@example.com',
   crypt('Local-Seed-2026!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"시드둘"}'::jsonb, now(), now())
on conflict (id) do nothing;

-- GoTrue는 이 토큰 컬럼들이 NULL이면 로그인을 거부한다(빈 문자열이어야 한다).
-- auth.users에 직접 넣을 때만 생기는 문제라 대시보드/API 생성 계정에는 없다.
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change = coalesce(email_change, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email like 'seed.%@example.com';

insert into public.profiles (id, email, name, phone, role, status, user_group, deposit_balance, low_balance_threshold)
values
  ('00000000-0000-4000-a000-000000000001', 'seed.admin@example.com', '시드관리자', '010-0000-0001', 'admin', 'active', 'group1', 0, 0),
  ('00000000-0000-4000-a000-000000000002', 'seed.group1@example.com', '시드상사', '010-0000-0002', 'user', 'active', 'group1', 5000000, 500000),
  ('00000000-0000-4000-a000-000000000003', 'seed.longname@example.com', '주식회사시드글로벌커머스', '010-0000-0003', 'user', 'active', 'group1', 12000000, 1000000),
  ('00000000-0000-4000-a000-000000000004', 'seed.group2@example.com', '시드둘', '010-0000-0004', 'user', 'active', 'group2', 0, 0)
on conflict (id) do update set name = excluded.name, role = excluded.role, status = excluded.status;

-- === 상품 (카탈로그 최대 39자) ============================================

insert into public.products (name, price, stock, is_active)
values
  ('시드 데일리 리페어 앰플 30ml 기획세트 2입', 28000, 500, true),
  ('시드 수분 크림', 15000, 300, true),
  ('시드 클렌징 오일 200ml', 22000, 120, true)
on conflict do nothing;

-- === 입고요청 =============================================================
-- 상품명 59자(최대), 옵션명 41자(최대), 송장 다중·빈칸·중복을 모두 포함한다.

insert into public.inbound_requests
  (id, user_id, title, body, status, excel_storage_path, excel_original_name, inbound_items, created_at)
values
  -- 1. 상품명·옵션명 최대 길이. 품목 표의 좁은 열을 가장 세게 압박한다.
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003',
   '시드 최대길이 상품명 입고요청', '', 'in_progress',
   'seed/excel/inbound-template.xlsx', 'inbound-template.xlsx',
   jsonb_build_array(
     jsonb_build_object(
       'row_number', 2,
       'product_name', '시드 락토핏 골드 프로메가 알티지 오메가3 듀얼이펙트 기획 사은품 증정',
       'option_name', '30포 1개입 15일분 파우치 2매 동봉 구성',
       'quantity', 10, 'carrier', 'CJ대한통운', 'tracking_number', '303261281096'),
     jsonb_build_object(
       'row_number', 3, 'product_name', '시드 수분 크림', 'option_name', '50ml',
       'quantity', 2, 'carrier', 'CJ대한통운', 'tracking_number', '303261281096')
   ),
   now() - interval '3 days'),

  -- 2. 송장 여러 개(제목에 "송장 3건"이 노출되는 케이스).
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000003',
   '시드 박스 여러 개 입고요청', '', 'open',
   'seed/excel/inbound-template.xlsx', 'inbound-template.xlsx',
   jsonb_build_array(
     jsonb_build_object('row_number', 2, 'product_name', '시드 리프팅 마스크', 'option_name', '5매입',
                        'quantity', 30, 'carrier', 'CJ대한통운', 'tracking_number', '303251816131'),
     jsonb_build_object('row_number', 3, 'product_name', '시드 콜라겐 앰플', 'option_name', '30ml',
                        'quantity', 12, 'carrier', '한진택배', 'tracking_number', '537450767696'),
     jsonb_build_object('row_number', 4, 'product_name', '시드 클렌징 오일', 'option_name', '',
                        'quantity', 6, 'carrier', '롯데택배', 'tracking_number', '505684729853')
   ),
   now() - interval '2 days'),

  -- 3. 송장번호 빈칸("송장번호 없음" 필터 대상).
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000002',
   '시드 송장 미기재 입고요청', '', 'open',
   'seed/excel/inbound-template.xlsx', 'inbound-template.xlsx',
   jsonb_build_array(
     jsonb_build_object('row_number', 2, 'product_name', '시드 수분 크림', 'option_name', '50ml',
                        'quantity', 20, 'carrier', null, 'tracking_number', null)
   ),
   now() - interval '2 days'),

  -- 4·5. 같은 송장 + 같은 상품 = 중복 입고 경고 대상. 하루 간격 재등록 형태.
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000002',
   '시드 중복 입고요청 (먼저 등록)', '', 'completed',
   'seed/excel/inbound-template.xlsx', 'inbound-template.xlsx',
   jsonb_build_array(
     jsonb_build_object('row_number', 2, 'product_name', '시드 리프팅 마스크', 'option_name', '5매입',
                        'quantity', 10, 'carrier', '한진택배', 'tracking_number', '602910283290')
   ),
   now() - interval '1 day' - interval '2 minutes'),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000002',
   '시드 중복 입고요청 (2분 뒤 재등록)', '', 'in_progress',
   'seed/excel/inbound-template.xlsx', 'inbound-template.xlsx',
   jsonb_build_array(
     jsonb_build_object('row_number', 2, 'product_name', '시드 리프팅 마스크', 'option_name', '5매입',
                        'quantity', 10, 'carrier', '한진택배', 'tracking_number', '602910283290')
   ),
   now() - interval '1 day'),

  -- 6. 제목 최대 길이(200자). 목록의 제목 열이 다른 열을 밀어내지 않는지 본다.
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000003',
   repeat('시드 제목 최대 길이 확인용 입고요청 ', 8) || '끝', '', 'open',
   'seed/excel/inbound-template.xlsx', 'inbound-template.xlsx',
   jsonb_build_array(
     jsonb_build_object('row_number', 2, 'product_name', '시드 수분 크림', 'option_name', '50ml',
                        'quantity', 1, 'carrier', '우체국택배', 'tracking_number', '113344556677')
   ),
   now() - interval '5 hours')
on conflict (id) do nothing;

-- === 사입재고 (관리자 사입재고 관리 화면) =================================

insert into public.purchased_inventory_lots
  (inbound_request_id, user_id, product_name, option_name, row_number, initial_quantity, remaining_quantity)
values
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-a000-000000000002',
   '시드 리프팅 마스크', '5매입', 2, 10, 7),
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003',
   '시드 락토핏 골드 프로메가 알티지 오메가3 듀얼이펙트 기획 사은품 증정',
   '30포 1개입 15일분 파우치 2매 동봉 구성', 2, 10, 10)
on conflict do nothing;

-- === 배송대행 업로드 ======================================================
-- 306행(운영 최대), 주소 106자, 받는사람 40자. 배송대행 상세 표를 압박한다.
-- shipping_fee_total은 체크 제약(행수 × 3300)을 맞춰야 한다.

with rows as (
  select jsonb_agg(
           jsonb_build_object(
             'no', n,
             'internal_code', '시드' || lpad(n::text, 4, '0'),
             'recipient', case when n = 1
               then '주식회사 시드글로벌커머스 물류센터 담당자 앞 수취인'      -- 40자
               else '시드수취인' || n end,
             'phone', '010-0000-' || lpad(n::text, 4, '0'),
             'address', case when n = 1
               then '서울특별시 강남구 테헤란로 123길 45, 시드빌딩 지하 1층 물류센터 A동 3번 게이트 (역삼동, 시드타워)'  -- 106자
               else '서울특별시 강남구 테헤란로 ' || n || '길 10, 시드빌딩 2층' end,
             'product_code', 'SEED-' || lpad(n::text, 4, '0'),
             'product_name', case when n = 1
               then '시드 락토핏 골드 프로메가 알티지 오메가3 듀얼이펙트 기획'
               else '시드 수분 크림' end,
             'quantity', 1,
             'memo', case when n = 1 then '문 앞에 놓아주세요. 부재 시 경비실 맡김 요청' else '' end,
             'tracking_number', case when n <= 3 then '30326128' || lpad(n::text, 4, '0') else null end
           ) order by n
         ) as items, count(*) as cnt
    from generate_series(1, 306) as n
)
insert into public.order_uploads
  (id, user_id, storage_path, original_name, items, total_quantity, status, upload_type, shipping_fee_total, created_at)
select '00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003',
       'seed/uploads/purchased.xlsx', 'purchased-shipping.xlsx',
       items, cnt, 'pending', 'purchased', cnt * 3300, now() - interval '6 hours'
  from rows
on conflict (id) do nothing;

with rows as (
  select jsonb_agg(
           jsonb_build_object(
             'no', n,
             'internal_code', '시드' || lpad(n::text, 3, '0'),
             'recipient', '시드수취인' || n,
             'phone', '010-0000-' || lpad(n::text, 4, '0'),
             'address', '경기도 성남시 분당구 판교역로 ' || n || '번길 7, 시드아파트 101동 1004호',
             'product_code', 'SEED-' || lpad(n::text, 3, '0'),
             'product_name', '시드 데일리 리페어 앰플 30ml 기획세트 2입',
             'quantity', 2, 'memo', '', 'tracking_number', null
           ) order by n
         ) as items, count(*) as cnt
    from generate_series(1, 12) as n
)
insert into public.order_uploads
  (id, user_id, storage_path, original_name, items, total_quantity, status, upload_type, shipping_fee_total, created_at)
select '00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002',
       'seed/uploads/exitmall.xlsx', 'exitmall-shipping.xlsx',
       items, cnt * 2, 'pending', 'exitmall', cnt * 3300, now() - interval '4 hours'
  from rows
on conflict (id) do nothing;

-- === 예치금 요청 ==========================================================

insert into public.deposit_requests (user_id, amount, depositor_name, status, admin_memo)
values
  ('00000000-0000-4000-a000-000000000003', 5000000, '주식회사시드글로벌커머스', 'pending',
   '입금자명이 사업자명과 달라 확인 요청드렸습니다. 회신 오는 대로 처리 예정입니다.'),
  ('00000000-0000-4000-a000-000000000002', 1200000, '시드상사', 'confirmed', null)
on conflict do nothing;

-- === FAQ ==================================================================

insert into public.faqs (audience, category, question, answer, user_groups, sort_order, created_by, updated_by)
values
  ('user', 'inbound',
   '입고요청 엑셀에 송장번호를 꼭 적어야 하나요? 아직 발송 전이라 번호가 나오지 않았습니다',
   '가능하면 발송 후 등록해 주세요. 송장번호가 없으면 창고에 도착한 박스와 요청을 맞출 수 없습니다.',
   array['group1','group2'], 1,
   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001'),
  ('admin', 'inbound',
   '중복 입고 경고가 떴을 때 어떻게 처리하나요',
   '겹치는 상품을 확인하고 실물을 대조한 뒤 완료 처리하세요. 같은 박스가 두 번 등록된 경우라면 한 건을 취소합니다.',
   null, 2,
   '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001')
on conflict do nothing;

commit;
