import { describe, it, expect } from 'vitest';
import {
  canTransition,
  canEditRequest,
  canEditComment,
  isLocked,
} from '@/lib/inbound/permissions';

describe('canTransition (admin-only state machine)', () => {
  it('open -> in_progress allowed', () => {
    expect(canTransition('open', 'in_progress')).toBe(true);
  });
  it('in_progress -> completed allowed', () => {
    expect(canTransition('in_progress', 'completed')).toBe(true);
  });
  it('open -> cancelled allowed', () => {
    expect(canTransition('open', 'cancelled')).toBe(true);
  });
  it('in_progress -> cancelled allowed', () => {
    expect(canTransition('in_progress', 'cancelled')).toBe(true);
  });
  it('open -> completed forbidden (must pass through in_progress)', () => {
    expect(canTransition('open', 'completed')).toBe(false);
  });
  it('completed -> in_progress forbidden (no reopen)', () => {
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });
  it('cancelled -> anything forbidden', () => {
    expect(canTransition('cancelled', 'open')).toBe(false);
    expect(canTransition('cancelled', 'in_progress')).toBe(false);
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });
  it('same-state transition forbidden', () => {
    expect(canTransition('open', 'open')).toBe(false);
  });
});

describe('isLocked', () => {
  it('open and in_progress are unlocked', () => {
    expect(isLocked('open')).toBe(false);
    expect(isLocked('in_progress')).toBe(false);
  });
  it('completed and cancelled are locked', () => {
    expect(isLocked('completed')).toBe(true);
    expect(isLocked('cancelled')).toBe(true);
  });
});

describe('canEditRequest (owner edits)', () => {
  it('owner can edit when status=open', () => {
    expect(canEditRequest({ status: 'open', isOwner: true, isAdmin: false })).toBe(true);
  });
  it('owner cannot edit when status=in_progress', () => {
    expect(canEditRequest({ status: 'in_progress', isOwner: true, isAdmin: false })).toBe(false);
  });
  it('non-owner non-admin cannot edit even when open', () => {
    expect(canEditRequest({ status: 'open', isOwner: false, isAdmin: false })).toBe(false);
  });
  it('admin can always edit', () => {
    expect(canEditRequest({ status: 'completed', isOwner: false, isAdmin: true })).toBe(true);
  });
});

describe('canEditComment (10-min window for own comments)', () => {
  const now = new Date('2026-05-12T10:00:00Z');
  it('own comment within 9 minutes is editable', () => {
    const created = new Date('2026-05-12T09:51:00Z');
    expect(canEditComment({ createdAt: created, isAuthor: true, isAdmin: false, now })).toBe(true);
  });
  it('own comment at 9:59 boundary is still editable', () => {
    const created = new Date('2026-05-12T09:50:01Z');
    expect(canEditComment({ createdAt: created, isAuthor: true, isAdmin: false, now })).toBe(true);
  });
  it('own comment at exactly 10 minutes is NOT editable', () => {
    const created = new Date('2026-05-12T09:50:00Z');
    expect(canEditComment({ createdAt: created, isAuthor: true, isAdmin: false, now })).toBe(false);
  });
  it('non-author non-admin cannot edit', () => {
    const created = new Date('2026-05-12T09:59:00Z');
    expect(canEditComment({ createdAt: created, isAuthor: false, isAdmin: false, now })).toBe(false);
  });
  it('admin can edit any time', () => {
    const created = new Date('2025-01-01T00:00:00Z');
    expect(canEditComment({ createdAt: created, isAuthor: false, isAdmin: true, now })).toBe(true);
  });
});
