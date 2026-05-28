/**
 * Zod 에러 포매터.
 *
 * 액션이 사용자에게 전달할 한국어 메시지를 생성한다.
 * - formatZodError: 첫 번째 메시지만 노출 (간단한 폼)
 * - formatZodPathError: 필드명을 함께 노출 (복잡한 폼)
 */
import type { ZodError } from 'zod';

export function formatZodError(error: ZodError, separator = ' · '): string {
  return error.errors.map((e) => e.message).join(separator);
}

export function formatZodPathError(error: ZodError, separator = ' · '): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(separator);
}
