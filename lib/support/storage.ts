export function safeSupportFilename(name: string): string {
  const filename = name.normalize('NFKC').replace(/\\/g, '/').split('/').pop() ?? '';
  const sanitized = filename
    .normalize('NFKC')
    .replace(/^\.+/, '')
    .replace(/\.{2,}/g, '.')
    .replace(/[^\w가-힣.\-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return sanitized || 'attachment';
}
