// Helpers shared between server actions and tests. Keep this file free of
// 'use server' so non-async functions can be exported and unit tested.

/**
 * Sanitize a user-supplied filename for use in a storage path.
 *
 * - Strips leading dots (prevents hidden-file or path-traversal-like names)
 * - Collapses runs of dots into a single dot
 * - Replaces any character that is not [A-Za-z0-9_가-힣.-] with `_`
 */
export function safeFilename(name: string): string {
  return name
    .replace(/^\.+/, '')
    .replace(/\.{2,}/g, '.')
    .replace(/[^\w가-힣\.\-]+/g, '_');
}
