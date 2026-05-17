import { describe, it, expect } from 'vitest';
import {
  signupSchema,
  passwordChangeSchema,
  findAccountSchema,
  directPasswordResetStartSchema,
  directPasswordResetCompleteSchema,
  passwordResetSchema,
  depositRequestSchema,
  checkoutSchema,
  productSchema,
  adjustBalanceSchema,
} from '@/lib/schemas';

describe('signupSchema', () => {
  const valid = { email: 'a@b.com', password: 'pw123456', name: '홍길동', phone: '010-1234-5678' };
  it('passes valid', () => expect(signupSchema.safeParse(valid).success).toBe(true));
  it('rejects short password', () => expect(signupSchema.safeParse({ ...valid, password: 'pw' }).success).toBe(false));
  it('rejects invalid phone', () => expect(signupSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false));
});

describe('passwordChangeSchema', () => {
  const valid = {
    currentPassword: 'oldpassword123',
    newPassword: 'newpassword123',
    confirmPassword: 'newpassword123',
  };
  it('passes valid', () => expect(passwordChangeSchema.safeParse(valid).success).toBe(true));
  it('rejects missing current password', () =>
    expect(passwordChangeSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(false));
  it('rejects short new password', () =>
    expect(passwordChangeSchema.safeParse({ ...valid, newPassword: 'short', confirmPassword: 'short' }).success).toBe(false));
  it('rejects mismatched confirmation', () =>
    expect(passwordChangeSchema.safeParse({ ...valid, confirmPassword: 'different123' }).success).toBe(false));
  it('rejects unchanged password', () =>
    expect(passwordChangeSchema.safeParse({
      currentPassword: 'samepassword123',
      newPassword: 'samepassword123',
      confirmPassword: 'samepassword123',
    }).success).toBe(false));
});

describe('findAccountSchema', () => {
  it('passes valid', () =>
    expect(findAccountSchema.safeParse({ name: '홍길동', phone: '010-1234-5678' }).success).toBe(true));
  it('rejects empty name', () =>
    expect(findAccountSchema.safeParse({ name: '', phone: '010-1234-5678' }).success).toBe(false));
  it('rejects invalid phone', () =>
    expect(findAccountSchema.safeParse({ name: '홍길동', phone: '12345' }).success).toBe(false));
});

describe('directPasswordResetStartSchema', () => {
  const valid = { name: '홍길동', phone: '010-1234-5678', email: 'a@b.com' };
  it('passes valid identity details', () =>
    expect(directPasswordResetStartSchema.safeParse(valid).success).toBe(true));
  it('rejects invalid email', () =>
    expect(directPasswordResetStartSchema.safeParse({ ...valid, email: 'not-email' }).success).toBe(false));
  it('rejects invalid phone', () =>
    expect(directPasswordResetStartSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false));
});

describe('passwordResetSchema', () => {
  const valid = { newPassword: 'newpassword123', confirmPassword: 'newpassword123' };
  it('passes valid', () => expect(passwordResetSchema.safeParse(valid).success).toBe(true));
  it('rejects short new password', () =>
    expect(passwordResetSchema.safeParse({ newPassword: 'short', confirmPassword: 'short' }).success).toBe(false));
  it('rejects mismatched confirmation', () =>
    expect(passwordResetSchema.safeParse({ ...valid, confirmPassword: 'different123' }).success).toBe(false));
});

describe('directPasswordResetCompleteSchema', () => {
  const valid = {
    resetToken: 'token',
    newPassword: 'newpassword123',
    confirmPassword: 'newpassword123',
  };
  it('requires a reset token', () =>
    expect(directPasswordResetCompleteSchema.safeParse({ ...valid, resetToken: '' }).success).toBe(false));
  it('passes valid token and password', () =>
    expect(directPasswordResetCompleteSchema.safeParse(valid).success).toBe(true));
});

describe('depositRequestSchema', () => {
  it('accepts 1000+', () => expect(depositRequestSchema.safeParse({ amount: 1000, depositorName: '홍길동' }).success).toBe(true));
  it('rejects under 1000', () => expect(depositRequestSchema.safeParse({ amount: 999, depositorName: '홍길동' }).success).toBe(false));
  it('rejects empty depositor', () => expect(depositRequestSchema.safeParse({ amount: 5000, depositorName: '' }).success).toBe(false));
});

describe('checkoutSchema', () => {
  const valid = {
    items: [{ productId: '00000000-0000-0000-0000-000000000001', quantity: 1 }],
    shipping: { name: '홍길동', phone: '010-1234-5678', address: '서울시 강남구 ...', memo: '' },
  };
  it('accepts valid', () => expect(checkoutSchema.safeParse(valid).success).toBe(true));
  it('rejects empty items', () =>
    expect(checkoutSchema.safeParse({ ...valid, items: [] }).success).toBe(false));
  it('rejects long address', () =>
    expect(checkoutSchema.safeParse({ ...valid, shipping: { ...valid.shipping, address: 'a'.repeat(201) } }).success).toBe(false));
});

describe('productSchema', () => {
  it('accepts -1 stock (unlimited)',
    () => expect(productSchema.safeParse({ name: 'x', description: '', price: 1000, stock: -1, isActive: true }).success).toBe(true));
  it('rejects negative price',
    () => expect(productSchema.safeParse({ name: 'x', description: '', price: -1, stock: 0, isActive: true }).success).toBe(false));
});

describe('adjustBalanceSchema', () => {
  it('accepts negative delta', () => expect(adjustBalanceSchema.safeParse({ delta: -1000, memo: '환불' }).success).toBe(true));
  it('rejects zero delta', () => expect(adjustBalanceSchema.safeParse({ delta: 0, memo: 'x' }).success).toBe(false));
  it('rejects empty memo', () => expect(adjustBalanceSchema.safeParse({ delta: 100, memo: '' }).success).toBe(false));
});
