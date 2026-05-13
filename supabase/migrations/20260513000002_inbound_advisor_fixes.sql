-- ============================================================================
-- 입고리스트 advisor 후속 보정
--   1) 트리거 함수는 RPC 로 노출될 이유 없어 EXECUTE 회수
--   2) 미인덱스 FK 보강 (perf advisor INFO)
-- ============================================================================

revoke execute on function public.inbound_comments_pin_columns() from public, anon, authenticated;
revoke execute on function public.inbound_requests_pin_columns() from public, anon, authenticated;

create index if not exists inbound_comments_author_idx
  on public.inbound_request_comments (author_id);

create index if not exists inbound_requests_reviewed_by_idx
  on public.inbound_requests (reviewed_by);
