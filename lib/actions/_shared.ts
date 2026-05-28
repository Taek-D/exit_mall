/**
 * lib/actions/_shared.ts — 호환 진입점.
 *
 * 본 모듈의 구현은 다음 4개 파일로 분할되었다:
 *   - _result.ts           (ActionResult, RedirectAction, actionError)
 *   - _zod.ts              (formatZodError, formatZodPathError)
 *   - _supabase-bridge.ts  (callRpc, mutationTable)
 *   - _revalidate-paths.ts (revalidatePaths + 도메인 경로 상수)
 *
 * 기존 import 호환을 위해 이 파일은 4개 모듈의 re-export 역할을 유지한다.
 *
 * import 컨벤션:
 *   - 코어 헬퍼(ActionResult, RedirectAction, actionError, formatZodError,
 *     formatZodPathError, callRpc, mutationTable, revalidatePaths)는
 *     이 배럴(_shared)에서 import 한다.
 *   - 도메인별 revalidate 경로 상수(shippingUploadAllPaths/adminTrackingPaths/
 *     supportDetailPaths/inboundDetailPaths/inboundListPaths)는 _shared가
 *     re-export 하지 않으므로 _revalidate-paths 에서 직접 import 한다.
 *
 * ## 신규 액션 작성 시 선택 가이드
 *
 * 1) 반환 타입
 *    - useFormState에 부착되는 액션  → ActionResult<T>
 *      (호출 측에서 `result.ok ? ... : result.error` 분기)
 *    - form action 속성에 직접 부착 + 성공 시 redirect → RedirectAction
 *      (호출 측에서 `result?.error`로 실패만 확인, 성공 시 클라이언트 미도달)
 *
 * 2) 가드 선택
 *    - 관리자 전용         → requireAdmin (role='admin', status='active')
 *    - 활성 사용자 전용     → requireSignedIn (status='active'만, group 무관)
 *    - group1 한정 기능    → requireUserGroup1 (group2 차단)
 *
 * 3) 도메인별 에러 매핑은 lib/errors/{도메인}.ts 의 mapXxxError 사용.
 *    인라인 if-체인 금지.
 *
 * 4) revalidate 경로 그룹은 _revalidate-paths.ts 의 함수로 추출.
 *    동일 경로 묶음이 2회 이상 반복되면 상수화 검토.
 */
export type { ActionResult, RedirectAction } from '@/lib/actions/_result';
export { actionError } from '@/lib/actions/_result';
export { formatZodError, formatZodPathError } from '@/lib/actions/_zod';
export { callRpc, mutationTable } from '@/lib/actions/_supabase-bridge';
export { revalidatePaths } from '@/lib/actions/_revalidate-paths';
