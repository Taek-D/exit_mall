-- 잔액부족 임계치 기본값을 100,000원으로 상향.
-- 신규 가입자: profiles 컬럼 default가 자동 적용된다 (handle_new_user가 컬럼을 명시하지 않음).
-- 기존 사용자: 정확히 이전 default 값(10,000) 이었던 행만 100,000으로 갱신.
--             관리자가 의도적으로 다른 값으로 지정한 행은 보존한다.

alter table public.profiles
  alter column low_balance_threshold set default 100000;

update public.profiles
   set low_balance_threshold = 100000
 where low_balance_threshold = 10000;
