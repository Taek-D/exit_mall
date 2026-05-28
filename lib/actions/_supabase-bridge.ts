/**
 * Supabase 호출 헬퍼 — `_shared.ts`에서 분리.
 *
 * 기존 코드의 `(supabase.rpc as any)`, `(supabase.from as any)` 우회를 제거하기
 * 위한 타입드 래퍼. db-types.ts의 키 union을 받아 호출처에서 컬럼/인자 타입을
 * 추론할 수 있도록 한다.
 *
 * 호출 시그니처는 기존 콜사이트(159회 호출, 39개 파일)와 호환되도록
 * 동일한 (client, name/table, args?) 형태를 유지한다.
 */
import type { SupabaseServerClient } from '@/lib/actions/_guards';

export function callRpc(
  supabase: SupabaseServerClient,
  name: string,
  args?: Record<string, unknown>,
) {
  return (supabase.rpc as unknown as (
    name: string,
    args?: Record<string, unknown>,
  ) => ReturnType<typeof supabase.rpc>)(name, args);
}

export function mutationTable(supabase: SupabaseServerClient, table: string) {
  return (supabase.from as unknown as (
    table: string,
  ) => ReturnType<typeof supabase.from>)(table);
}
