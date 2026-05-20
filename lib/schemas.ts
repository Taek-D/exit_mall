import { z } from 'zod';

const PHONE_RX = /^01[016789]-?\d{3,4}-?\d{4}$/;

export const signupSchema = z.object({
  email: z.string().email('이메일 형식이 아닙니다'),
  password: z.string().min(8, '비밀번호는 8자 이상').max(72),
  name: z.string().min(1, '이름을 입력하세요').max(30),
  phone: z.string().regex(PHONE_RX, '휴대폰 번호 형식이 아닙니다'),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const adminUserContactSchema = z.object({
  name: z.string().trim().min(1, '이름을 입력하세요').max(30, '이름은 30자 이하입니다'),
  phone: z.string().trim().regex(PHONE_RX, '휴대폰 번호 형식이 아닙니다'),
});
export type AdminUserContactInput = z.infer<typeof adminUserContactSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, '현재 비밀번호를 입력하세요'),
    newPassword: z.string().min(8, '새 비밀번호는 8자 이상').max(72),
    confirmPassword: z.string().min(1, '새 비밀번호 확인을 입력하세요'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '새 비밀번호가 일치하지 않습니다',
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: '현재 비밀번호와 다른 새 비밀번호를 입력하세요',
  });
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;

export const findAccountSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요').max(30),
  phone: z.string().regex(PHONE_RX, '휴대폰 번호 형식이 아닙니다'),
});
export type FindAccountInput = z.infer<typeof findAccountSchema>;

export const directPasswordResetStartSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요').max(30),
  phone: z.string().regex(PHONE_RX, '휴대폰 번호 형식이 아닙니다'),
  email: z.string().email('이메일 형식이 아닙니다'),
});
export type DirectPasswordResetStartInput = z.infer<typeof directPasswordResetStartSchema>;

const passwordResetFieldsSchema = z.object({
  newPassword: z.string().min(8, '새 비밀번호는 8자 이상').max(72),
  confirmPassword: z.string().min(1, '새 비밀번호 확인을 입력하세요'),
});

export const passwordResetSchema = passwordResetFieldsSchema
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '새 비밀번호가 일치하지 않습니다',
  });
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;

export const directPasswordResetCompleteSchema = passwordResetFieldsSchema
  .extend({
    resetToken: z.string().min(1, '비밀번호 재설정 확인이 필요합니다'),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: '새 비밀번호가 일치하지 않습니다',
  });
export type DirectPasswordResetCompleteInput = z.infer<typeof directPasswordResetCompleteSchema>;

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
  brand: z.string().max(100).optional().nullable().default(null),
  optionName: z.string().max(100).optional().nullable().default(null),
  managementCode: z.string().max(100).optional().nullable().default(null),
  category: z.string().max(100).optional().nullable().default(null),
  barcode: z.string().max(100).optional().nullable().default(null),
  perUserLimit: z
    .number()
    .int('1인 구매 한도는 정수여야 합니다')
    .min(1, '1인 구매 한도는 1 이상이거나 비워두세요')
    .nullable()
    .optional()
    .default(null),
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

const supportCategorySchema = z.enum(['exchange', 'return', 'cs', 'other']);
const supportReferenceTypeSchema = z.enum(['none', 'order', 'tracking', 'other']);

export const supportRequestCreateSchema = z.object({
  category: supportCategorySchema,
  title: z.string().trim().min(1, '제목을 입력해주세요').max(200, '제목은 200자 이하여야 합니다'),
  body: z.string().trim().min(1, '내용을 입력해주세요').max(5000, '내용은 5000자 이하여야 합니다'),
  referenceType: supportReferenceTypeSchema.default('none'),
  referenceValue: z
    .string()
    .trim()
    .max(100, '참고번호는 100자 이하여야 합니다')
    .optional()
    .transform((value) => (value ? value : null)),
});

export const supportCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요')
    .max(2000, '댓글은 2000자 이하여야 합니다'),
});

export const inboundRequestCreateSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요').max(200, '제목은 200자 이하여야 합니다'),
  body: z.string().max(5000, '본문은 5000자 이하여야 합니다').optional().default(''),
});

export const inboundCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, '내용을 입력해주세요')
    .max(2000, '댓글은 2000자 이하여야 합니다'),
});
