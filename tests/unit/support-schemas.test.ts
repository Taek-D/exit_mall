import { describe, expect, it } from 'vitest';
import { supportCommentSchema, supportRequestCreateSchema } from '@/lib/schemas';

describe('supportRequestCreateSchema', () => {
  it('accepts a valid support request', () => {
    const result = supportRequestCreateSchema.safeParse({
      category: 'exchange',
      title: '상품 교환 요청',
      body: '사이즈 교환 부탁드립니다.',
      referenceType: 'order',
      referenceValue: 'ORDER-100',
    });

    expect(result.success).toBe(true);
  });

  it('defaults reference fields when omitted', () => {
    const result = supportRequestCreateSchema.safeParse({
      category: 'cs',
      title: '문의',
      body: '내용입니다.',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.referenceType).toBe('none');
      expect(result.data.referenceValue).toBeNull();
    }
  });

  it('rejects an invalid category', () => {
    const result = supportRequestCreateSchema.safeParse({
      category: 'refund',
      title: '문의',
      body: '내용입니다.',
    });

    expect(result.success).toBe(false);
  });

  it('rejects empty title and body', () => {
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'return',
        title: '',
        body: '내용입니다.',
      }).success,
    ).toBe(false);
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'return',
        title: '반품',
        body: '',
      }).success,
    ).toBe(false);
  });

  it('rejects long fields', () => {
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'other',
        title: 'x'.repeat(201),
        body: '내용입니다.',
      }).success,
    ).toBe(false);
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'other',
        title: '기타',
        body: 'x'.repeat(5001),
      }).success,
    ).toBe(false);
    expect(
      supportRequestCreateSchema.safeParse({
        category: 'other',
        title: '기타',
        body: '내용입니다.',
        referenceType: 'other',
        referenceValue: 'x'.repeat(101),
      }).success,
    ).toBe(false);
  });
});

describe('supportCommentSchema', () => {
  it('accepts a short comment', () => {
    expect(supportCommentSchema.safeParse({ body: '확인했습니다.' }).success).toBe(true);
  });

  it('rejects empty and overlong comments', () => {
    expect(supportCommentSchema.safeParse({ body: '' }).success).toBe(false);
    expect(supportCommentSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
  });
});
