import { describe, expect, it } from 'vitest';
import {
  supportAttachmentPath,
  supportCleanupPaths,
  supportCommentImagePath,
} from '@/lib/support/upload-paths';
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

describe('supportCommentImagePath', () => {
  it('builds a canonical private storage path for one comment image', () => {
    expect(
      supportCommentImagePath({
        userId: 'admin-1',
        requestId: 'request-1',
        commentId: 'comment-1',
        imageId: 'image-1',
        originalName: 'reply proof.png',
      }),
    ).toBe('admin-1/request-1/comments/comment-1/image-1-reply_proof.png');
  });
});

describe('supportCleanupPaths', () => {
  it('drops empty paths', () => {
    expect(supportCleanupPaths(['a/b.png', '', 'c/d.pdf'])).toEqual(['a/b.png', 'c/d.pdf']);
  });
});
