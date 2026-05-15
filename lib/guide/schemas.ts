import { z } from 'zod';
import {
  USER_FAQ_CATEGORIES,
  ADMIN_FAQ_CATEGORIES,
} from './categories';

const UserGroupEnum = z.enum(['group1', 'group2']);

const userInput = z.object({
  audience: z.literal('user'),
  user_groups: z.array(UserGroupEnum).min(1).max(2),
  category: z.enum(USER_FAQ_CATEGORIES),
});

const adminInput = z.object({
  audience: z.literal('admin'),
  user_groups: z.null(),
  category: z.enum(ADMIN_FAQ_CATEGORIES),
});

const commonInput = z.object({
  question: z.string().trim().min(1, '질문을 입력해주세요').max(200, '질문은 200자 이하여야 합니다'),
  answer: z.string().trim().min(1, '답변을 입력해주세요').max(5000, '답변은 5000자 이하여야 합니다'),
  sort_order: z.number().int().default(0),
});

export const FaqInputSchema = z.discriminatedUnion('audience', [
  userInput.merge(commonInput),
  adminInput.merge(commonInput),
]);

export type FaqInput = z.infer<typeof FaqInputSchema>;
