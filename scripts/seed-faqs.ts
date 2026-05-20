// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm tsx scripts/seed-faqs.ts
// Optional:
//   SEED_OWNER_EMAIL=admin@example.com

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

type SeedFaq = {
  audience: 'user';
  user_groups: ['group1', 'group2'];
  category: 'account' | 'deposit' | 'inbound' | 'purchase' | 'shipping-upload';
  question: string;
  answer: string;
  sort_order: number;
};

function loadEnvFile(fileName: string) {
  const path = resolve(process.cwd(), fileName);
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.SEED_OWNER_EMAIL;

if (!url || !serviceRole) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRole);

const userGroups: ['group1', 'group2'] = ['group1', 'group2'];

const rows: SeedFaq[] = [
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'account',
    question: '가입 승인은 언제 되나요?',
    answer:
      '평일 기준 하루 2회 순차적으로 진행됩니다.\n\n' +
      '* 승인 시간: 평일 오전 10시 / 오후 5시\n' +
      '* 현재, 엑시트몰 상품은 다마고치 수강생들에게만 오픈됩니다.',
    sort_order: 10,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'shipping-upload',
    question: '엑시트몰 상품 구매 후 배송대행 이용절차가 어떻게 되나요?',
    answer:
      '엑시트몰 배송대행은 아래와 같이 진행됩니다.\n\n' +
      '1. 엑시트몰 상품 구매\n' +
      '2. 재고 승인 완료\n' +
      '3. 승인된 재고만큼 플랫폼에 판매\n' +
      '4. 쿠팡, 스마트스토어에서 고객 주문내역 다운로드 후 [엑시트몰 배송대행] 메뉴 양식에 맞춰 업로드\n' +
      '5. 엑시트몰에서 발급된 송장번호 확인 후, 판매 플랫폼에 재업로드',
    sort_order: 10,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'shipping-upload',
    question: '엑시트몰 상품이 아닌, 직접 사입한 상품의 배송대행 이용절차가 어떻게 되나요?',
    answer:
      '아래와 같은 단계로 진행됩니다.\n\n' +
      '1. 쿠팡, 스마트스토어에서 고객 주문내역 다운로드 후 [사입재고 배송대행] 메뉴 양식에 맞춰 업로드\n' +
      '2. 엑시트몰에서 발급된 송장번호 확인 후, 판매 플랫폼에 재업로드',
    sort_order: 20,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'purchase',
    question: '상품 주문 후 승인은 언제 되나요?',
    answer:
      '평일 기준 하루 2회 순차적으로 진행됩니다.\n\n' +
      '* 승인 시간: 평일 오전 10시 / 오후 5시',
    sort_order: 10,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'purchase',
    question: '상품 구매시 배송비가 차감되나요?',
    answer: '아닙니다. 상품 구매에 대한 금액만 차감됩니다.',
    sort_order: 20,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'deposit',
    question: '배송비는 예치금에서 차감되나요?',
    answer:
      '아닙니다. 배송비는 예치금 차감이 아닌 **월차 정산(후불)**으로 진행됩니다.\n\n' +
      '- 정산 방식: 한달간 발생한 배송비를 합산하여 매월 초 개별 안내해 드립니다.\n' +
      '- 입금 및 계산서 발행: 안내된 금액을 입금해 주시면 확인 후 세금계산서가 발행됩니다.',
    sort_order: 30,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'purchase',
    question: '상품 주문이 안돼요.',
    answer:
      '품절임박인 상품의 경우, 주문 수량과 재고가 맞지 않아 주문이 되지 않을 수 있습니다.\n\n' +
      '문의 게시판에 남겨주시면 처리 도와드리겠습니다.',
    sort_order: 30,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'shipping-upload',
    question: '배송대행 신청시, 품목명/내품명/내품수량이 뭔가요?',
    answer:
      '배송대행 신청서 작성 시, 상품을 정확히 식별할 수 있도록 아래 기준에 맞춰 작성해 주세요.\n\n' +
      '- 품목명: 보유재고와 일치하는 **[상품명]**을 적어주세요.\n' +
      '- 내품명: 상품의 구체적인 **[옵션 정보]**를 적어주세요. 예: 본품, 리필, 용량, 색상 등\n' +
      '- 주의: 내품명 칸에는 수량을 적지 마세요. 수량은 내품수량 칸에만 입력하셔야 합니다.\n' +
      '- 내품수량: 해당 주문건의 **[실제 발송 수량]**을 적어주세요.',
    sort_order: 30,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'inbound',
    question: '입고리스트 어떻게 진행되나요?',
    answer:
      '엑시트몰 상품이 아닌, 외부 사입 제품인 경우에만 해당됩니다. 양식은 해당 메뉴에 있습니다.\n\n' +
      '택배사/송장번호/참고사항 등을 꼭 적어주셔야 입고확인이 빠르게 가능합니다. 상품 입고 후 수량 및 상태 검토 후 댓글로 입고여부 및 추가 안내사항을 기재해드립니다.\n\n' +
      '비공개 게시판으로 글을 남겨주시면 그 후로는 댓글로 일대일 소통으로 진행됩니다.',
    sort_order: 10,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'inbound',
    question: '입고리스트 승인은 언제인가요?',
    answer: '평일 기준 하루 1회, 오후 5시 30분 이후로 순차적으로 진행됩니다.',
    sort_order: 20,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'deposit',
    question: '예치금 최소 충전 금액은 얼마인가요?',
    answer: '100만원입니다. 잔액 10만원 이하일 경우, 알림이 뜹니다.',
    sort_order: 10,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'shipping-upload',
    question: '반품접수, 파손 등 어디에 문의하나요?',
    answer:
      '문의 게시판에 남겨주시면 도와드리겠습니다.\n\n' +
      '비공개 게시판으로 글을 남겨주시면 그 후로는 댓글로 일대일 소통으로 진행됩니다.',
    sort_order: 40,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'deposit',
    question: '예치금 정산은 어떻게 되나요?',
    answer: '예치금은 월초 확인하여 계산서 발행합니다.',
    sort_order: 20,
  },
  {
    audience: 'user',
    user_groups: userGroups,
    category: 'deposit',
    question: '배송비 정산은 어떻게 되나요?',
    answer:
      '배송비는 예치금에서 차감되지 않습니다. 월초 개별적으로 내역을 안내해드리며, 입금 확인 후 계산서가 발행됩니다.',
    sort_order: 40,
  },
];

async function findOwnerId() {
  if (ownerEmail) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', ownerEmail)
      .maybeSingle<{ id: string }>();

    if (error) throw new Error(error.message);
    if (data) return data.id;

    throw new Error(`No profile found for SEED_OWNER_EMAIL=${ownerEmail}`);
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(error.message);
  if (data) return data.id;

  throw new Error('No admin profile found. Set SEED_OWNER_EMAIL to an existing admin email.');
}

async function main() {
  const ownerId = await findOwnerId();
  let inserted = 0;
  let updated = 0;

  for (const row of rows) {
    const { data: existing, error: selectError } = await supabase
      .from('faqs')
      .select('id')
      .eq('audience', row.audience)
      .eq('question', row.question)
      .limit(1);

    if (selectError) throw new Error(selectError.message);

    if ((existing ?? []).length > 0) {
      const { error } = await supabase
        .from('faqs')
        .update({
          user_groups: row.user_groups,
          category: row.category,
          answer: row.answer,
          sort_order: row.sort_order,
          updated_by: ownerId,
        })
        .eq('audience', row.audience)
        .eq('question', row.question);

      if (error) throw new Error(`Update failed for "${row.question}": ${error.message}`);
      updated += 1;
    } else {
      const { error } = await supabase.from('faqs').insert({
        ...row,
        created_by: ownerId,
        updated_by: ownerId,
      });

      if (error) throw new Error(`Insert failed for "${row.question}": ${error.message}`);
      inserted += 1;
    }
  }

  console.log(`FAQ seed complete. inserted=${inserted}, updated=${updated}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
