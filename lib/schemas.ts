import { z } from 'zod';

const PHONE_RX = /^01[016789]-?\d{3,4}-?\d{4}$/;

export const signupSchema = z.object({
  email: z.string().email('이메일 형식이 아닙니다'),
  password: z.string().min(8, '비밀번호는 8자 이상').max(72),
  name: z.string().min(1, '이름을 입력하세요').max(30),
  phone: z.string().regex(PHONE_RX, '휴대폰 번호 형식이 아닙니다'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const depositRequestSchema = z.object({
  amount: z.number().int().min(1000, '1,000원 이상부터 가능합니다'),
  depositorName: z.string().min(1).max(30),
});
export type DepositRequestInput = z.infer<typeof depositRequestSchema>;

export const checkoutSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().int().min(1),
  })).min(1, '장바구니가 비어있습니다'),
  shipping: z.object({
    name: z.string().min(1, '받는 사람을 입력하세요').max(30, '받는 사람은 30자 이하'),
    phone: z.string().regex(PHONE_RX, '연락처 형식이 올바르지 않습니다 (예: 010-1234-5678)'),
    address: z.string().min(1, '주소를 입력하세요').max(200, '주소는 200자 이하'),
    memo: z.string().max(200, '배송 메모는 200자 이하').optional().or(z.literal('')),
  }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const productSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요').max(100, '이름은 100자 이하'),
  description: z.string().max(1000, '설명은 1000자 이하').default(''),
  price: z.number().int('가격은 정수여야 합니다').min(0, '가격은 0 이상'),
  stock: z.number().int('재고는 정수여야 합니다').min(-1, '재고는 -1(무제한) 또는 0 이상'),
  isActive: z.boolean(),
  imageUrl: z.string().url('이미지 URL 형식이 올바르지 않습니다').optional().nullable(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const adjustBalanceSchema = z.object({
  delta: z.number().int().refine(v => v !== 0, '0이 아닌 값이어야 합니다'),
  memo: z.string().min(1, '사유를 입력하세요').max(200),
});
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;

export const appSettingsSchema = z.object({
  bankName: z.string().max(30),
  bankAccountNumber: z.string().max(50),
  bankAccountHolder: z.string().max(30),
  notice: z.string().max(1000),
});
export type AppSettingsInput = z.infer<typeof appSettingsSchema>;

export const thresholdSchema = z.object({
  threshold: z.number().int().min(0).max(10_000_000),
});
