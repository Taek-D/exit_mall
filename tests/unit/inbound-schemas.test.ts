import { describe, it, expect } from 'vitest';
import {
  inboundRequestCreateSchema,
  inboundCommentSchema,
} from '@/lib/schemas';

describe('inboundRequestCreateSchema', () => {
  it('accepts minimal valid input', () => {
    const r = inboundRequestCreateSchema.safeParse({ title: 'a', body: '' });
    expect(r.success).toBe(true);
  });
  it('rejects empty title', () => {
    const r = inboundRequestCreateSchema.safeParse({ title: '', body: '' });
    expect(r.success).toBe(false);
  });
  it('rejects title over 200 chars', () => {
    const r = inboundRequestCreateSchema.safeParse({
      title: 'x'.repeat(201),
      body: '',
    });
    expect(r.success).toBe(false);
  });
  it('rejects body over 5000 chars', () => {
    const r = inboundRequestCreateSchema.safeParse({
      title: 'ok',
      body: 'x'.repeat(5001),
    });
    expect(r.success).toBe(false);
  });
  it('treats missing body as empty', () => {
    const r = inboundRequestCreateSchema.safeParse({ title: 'ok' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.body).toBe('');
  });
});

describe('inboundCommentSchema', () => {
  it('accepts a short comment', () => {
    expect(inboundCommentSchema.safeParse({ body: 'hi' }).success).toBe(true);
  });
  it('rejects empty body', () => {
    expect(inboundCommentSchema.safeParse({ body: '' }).success).toBe(false);
  });
  it('rejects body over 2000 chars', () => {
    expect(
      inboundCommentSchema.safeParse({ body: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});
