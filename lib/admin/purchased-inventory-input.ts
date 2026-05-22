import { z } from 'zod';

const optionalTrimmedString = (max: number, message: string) =>
  z.string().trim().max(max, message).default('');

const addPurchasedInventorySchema = z.object({
  userId: z.string().uuid('올바른 사용자 ID가 아닙니다.'),
  productName: z
    .string()
    .trim()
    .min(1, '상품명을 입력해 주세요.')
    .max(100, '상품명은 100자 이하여야 합니다.'),
  optionName: optionalTrimmedString(100, '옵션명은 100자 이하여야 합니다.'),
  quantity: z.number().int('수량은 정수여야 합니다.').min(1, '수량은 1 이상이어야 합니다.'),
  memo: optionalTrimmedString(200, '메모는 200자 이하여야 합니다.'),
});

const updatePurchasedInventorySchema = z.object({
  userId: z.string().uuid('올바른 사용자 ID가 아닙니다.'),
  lotId: z.string().uuid('올바른 사입재고 ID가 아닙니다.'),
  productName: z
    .string()
    .trim()
    .min(1, '상품명을 입력해 주세요.')
    .max(100, '상품명은 100자 이하여야 합니다.'),
  optionName: optionalTrimmedString(100, '옵션명은 100자 이하여야 합니다.'),
  remainingQuantity: z
    .number()
    .int('남은 수량은 정수여야 합니다.')
    .min(0, '남은 수량은 0 이상이어야 합니다.'),
  memo: optionalTrimmedString(200, '메모는 200자 이하여야 합니다.'),
});

export function parseAddPurchasedInventoryInput(input: unknown) {
  return addPurchasedInventorySchema.safeParse(input);
}

export function parseUpdatePurchasedInventoryInput(input: unknown) {
  return updatePurchasedInventorySchema.safeParse(input);
}
