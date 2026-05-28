/**
 * 서버 액션 반환 타입 표준.
 *
 * - ActionResult<T>: 클라이언트에서 결과(state)를 받아 분기하는 액션용 판별 유니언.
 *   useFormState로 부착된 폼에 적합.
 * - RedirectAction: redirect()로 끝나는 액션의 시그니처.
 *   성공 시 클라이언트에 절대 도달하지 않으며(throw NEXT_REDIRECT), 실패 시 { error }
 *   를 반환한다. form 의 action 속성에 직접 부착할 때 사용한다.
 */

export type ActionResult<T extends Record<string, unknown> | void = void> =
  | ({ ok: true } & (T extends void ? unknown : T))
  | { ok: false; error: string };

export type RedirectAction = Promise<{ error: string } | never>;

export function actionError(error: string): { ok: false; error: string } {
  return { ok: false, error };
}
