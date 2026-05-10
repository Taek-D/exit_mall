import { revalidatePath } from 'next/cache';
import type { ZodError } from 'zod';
import type { SupabaseServerClient } from '@/lib/actions/_guards';

export type ActionResult<T extends Record<string, unknown> | void = void> =
  | ({ ok: true } & (T extends void ? unknown : T))
  | { ok: false; error: string };

export function actionError(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function formatZodError(error: ZodError, separator = ' · '): string {
  return error.errors.map((e) => e.message).join(separator);
}

export function formatZodPathError(error: ZodError, separator = ' · '): string {
  return error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(separator);
}

export function revalidatePaths(paths: string[]): void {
  for (const path of paths) {
    revalidatePath(path);
  }
}

export function callRpc(
  supabase: SupabaseServerClient,
  name: string,
  args?: Record<string, unknown>,
) {
  return (supabase.rpc as any)(name, args);
}

export function mutationTable(supabase: SupabaseServerClient, table: string) {
  return (supabase.from as any)(table);
}
