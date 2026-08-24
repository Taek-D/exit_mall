-- 입고요청 송장번호를 조회 가능한 형태로 노출한다.
--
-- 송장번호는 이미 inbound_items jsonb 안에 파싱되어 저장되고 있었지만
-- 화면에서 읽을 수도, 검색할 수도 없었다. 관리자가 도착한 박스와 요청을
-- 맞추려면 첨부 엑셀을 직접 열어야 했고, 같은 박스가 두 번 등록돼도
-- 완료 처리 전에 알아챌 방법이 없었다.
--
-- inbound_items는 제출 후 불변이므로(inbound_requests_pin_columns) 파생
-- 컬럼으로 뽑아도 원본과 어긋나지 않는다. generated 컬럼이라 백필도
-- 트리거도 필요 없다.

-- === 송장번호 추출 ===========================================================

create or replace function public.inbound_tracking_numbers(p_items jsonb)
returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct s.t order by s.t), '{}'::text[])
    from (
      select nullif(btrim(e->>'tracking_number'), '') as t
        from jsonb_array_elements(
               case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
             ) e
    ) s
   where s.t is not null;
$$;

-- 표기 차이(하이픈·공백·대소문자)를 흡수한 비교용 값.
create or replace function public.inbound_tracking_numbers_norm(p_items jsonb)
returns text[]
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(distinct s.t order by s.t), '{}'::text[])
    from (
      select nullif(regexp_replace(upper(coalesce(e->>'tracking_number', '')), '[^0-9A-Z]', '', 'g'), '') as t
        from jsonb_array_elements(
               case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
             ) e
    ) s
   where s.t is not null;
$$;

alter table public.inbound_requests
  add column if not exists tracking_numbers text[]
    generated always as (public.inbound_tracking_numbers(inbound_items)) stored;

alter table public.inbound_requests
  add column if not exists tracking_numbers_norm text[]
    generated always as (public.inbound_tracking_numbers_norm(inbound_items)) stored;

create index if not exists inbound_requests_tracking_norm_idx
  on public.inbound_requests using gin (tracking_numbers_norm);

-- === 중복 입고 감지 ==========================================================

-- 송장번호만 겹치는 요청은 취소 건을 빼도 55건 있는데(2026-08 기준, 취소
-- 제외 1,189건 중 4.6%) 대부분 박스 하나를 상품별로 나눠 등록한 정상 사용이다.
-- 그래서 송장 일치만으로는 신호가 되지 않고, 상품·옵션까지 겹칠 때만 중복으로
-- 본다(22건, 1.9%). 취소된 요청은 재고를 만들지 않으므로 제외한다.
drop function if exists public.find_inbound_duplicates(uuid);

create or replace function public.find_inbound_duplicates(p_request_id uuid)
returns table (
  id uuid,
  title text,
  status text,
  created_at timestamptz,
  shared_tracking text[],
  shared_products text[],
  overlap_count int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_req record;
begin
  select r.id, r.user_id, r.tracking_numbers_norm, r.inbound_items
    into v_req
    from public.inbound_requests r
   where r.id = p_request_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.is_admin() or v_req.user_id = (select auth.uid())) then
    raise exception 'FORBIDDEN';
  end if;
  if coalesce(cardinality(v_req.tracking_numbers_norm), 0) = 0 then return; end if;

  return query
  with mine as (
    select distinct
           lower(btrim(e->>'product_name')) || '|' || lower(btrim(coalesce(e->>'option_name', ''))) as k
      from jsonb_array_elements(
             case when jsonb_typeof(v_req.inbound_items) = 'array' then v_req.inbound_items else '[]'::jsonb end
           ) e
     where btrim(coalesce(e->>'product_name', '')) <> ''
  ),
  candidate as (
    select r.id, r.title, r.status, r.created_at, r.inbound_items,
           array(
             select unnest(r.tracking_numbers_norm)
             intersect
             select unnest(v_req.tracking_numbers_norm)
           ) as shared
      from public.inbound_requests r
     where r.user_id = v_req.user_id
       and r.id <> v_req.id
       and r.status <> 'cancelled'
       and r.tracking_numbers_norm && v_req.tracking_numbers_norm
  )
  select c.id, c.title, c.status, c.created_at, c.shared, o.labels, o.n
    from candidate c
    cross join lateral (
      select coalesce(array_agg(t.label order by t.label), '{}'::text[]) as labels,
             count(*)::int as n
        from (
          select distinct
                 lower(btrim(e->>'product_name')) || '|' || lower(btrim(coalesce(e->>'option_name', ''))) as k,
                 case
                   when btrim(coalesce(e->>'option_name', '')) = '' then btrim(e->>'product_name')
                   else btrim(e->>'product_name') || ' / ' || btrim(e->>'option_name')
                 end as label
            from jsonb_array_elements(
                   case when jsonb_typeof(c.inbound_items) = 'array' then c.inbound_items else '[]'::jsonb end
                 ) e
           where btrim(coalesce(e->>'product_name', '')) <> ''
        ) t
       where t.k in (select k from mine)
    ) o
   where o.n > 0
   order by c.created_at desc;
end; $$;

revoke execute on function public.find_inbound_duplicates(uuid) from public, anon;
grant execute on function public.find_inbound_duplicates(uuid) to authenticated;

-- === 관리자 목록 검색 ========================================================

-- 송장번호 검색과 "송장번호 없음" 필터를 추가한다. 박스에 붙은 12자리를
-- 손으로 다 치면 오타가 나므로 부분 일치(끝 4자리 등)를 허용한다.
drop function if exists public.search_inbound_requests(text, text, int);

create or replace function public.search_inbound_requests(
  p_q text default null,
  p_status text default null,
  p_limit int default 200,
  p_missing_tracking boolean default false
) returns table (
  id uuid,
  user_id uuid,
  title text,
  status text,
  last_comment_at timestamptz,
  last_comment_by_role text,
  user_last_read_at timestamptz,
  admin_last_read_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  tracking_numbers text[],
  profile_name text,
  profile_email text
)
language sql stable security definer set search_path = public as $$
  with q as (
    select nullif(btrim(coalesce(p_q, '')), '') as raw,
           nullif(regexp_replace(upper(coalesce(p_q, '')), '[^0-9A-Z]', '', 'g'), '') as norm
  )
  select r.id, r.user_id, r.title, r.status,
         r.last_comment_at, r.last_comment_by_role,
         r.user_last_read_at, r.admin_last_read_at,
         r.created_at, r.updated_at,
         r.tracking_numbers,
         p.name as profile_name, p.email as profile_email
    from public.inbound_requests r
    join public.profiles p on p.id = r.user_id
   cross join q
   where public.is_admin()
     and (p_status is null or r.status = p_status)
     and (not coalesce(p_missing_tracking, false)
          or coalesce(cardinality(r.tracking_numbers), 0) = 0)
     and (
       q.raw is null
       or p.name  ilike '%' || q.raw || '%'
       or p.email ilike '%' || q.raw || '%'
       or (q.norm is not null and exists (
             select 1 from unnest(r.tracking_numbers_norm) t
              where t like '%' || q.norm || '%'
           ))
     )
   order by r.created_at desc
   limit greatest(0, least(coalesce(p_limit, 200), 500));
$$;

revoke execute on function public.search_inbound_requests(text, text, int, boolean) from public, anon;
grant execute on function public.search_inbound_requests(text, text, int, boolean) to authenticated;
