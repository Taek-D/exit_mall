import { describe, expect, it } from 'vitest';
import { supportAttachmentPath, supportCleanupPaths } from '@/lib/support/upload-paths';
import { safeSupportFilename } from '@/lib/support/storage';

describe('safeSupportFilename', () => {
  it('keeps Korean names and safe punctuation', () => {
    expect(safeSupportFilename('반품 사진 1.png')).toBe('반품_사진_1.png');
  });

  it('removes leading dots and collapses unsafe characters', () => {
    expect(safeSupportFilename('../../secret?.pdf')).toBe('secret_.pdf');
  });
});

describe('supportAttachmentPath', () => {
  it('builds a canonical private storage path', () => {
    expect(
      supportAttachmentPath({
        userId: 'user-1',
        requestId: 'request-1',
        attachmentId: 'attachment-1',
        originalName: '교환 증빙.png',
      }),
    ).toBe('user-1/request-1/attachments/attachment-1-교환_증빙.png');
  });
});

describe('supportCleanupPaths', () => {
  it('drops empty paths', () => {
    expect(supportCleanupPaths(['a/b.png', '', 'c/d.pdf'])).toEqual(['a/b.png', 'c/d.pdf']);
  });
});
