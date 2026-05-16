import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerEmail = process.env.SEED_OWNER_EMAIL ?? 'admin@example.com';

if (!url || !serviceRole) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRole);

async function main() {
  const { data: owner } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', ownerEmail)
    .single<{ id: string }>();
  if (!owner) {
    console.error(`No profile for ${ownerEmail}`);
    process.exit(1);
  }

  const rows = [
    {
      audience: 'user', user_groups: ['group1'], category: 'purchase',
      question: '검토대기 중인 주문을 취소하면 예치금은 어떻게 되나요?',
      answer: '검토대기 단계에서는 예치금이 차감되지 않고 예약만 되어 있어, 취소 즉시 가용 잔액으로 돌아갑니다.',
      sort_order: 10,
    },
    {
      audience: 'user', user_groups: ['group1', 'group2'], category: 'inbound',
      question: '입고 요청은 다른 사람에게도 보이나요?',
      answer: '아니요. 본인과 관리자만 열람할 수 있는 비공개 게시글입니다.',
      sort_order: 10,
    },
    {
      audience: 'admin', user_groups: null, category: 'shipping-upload',
      question: '송장 엑셀을 두 번 업로드하면 어떻게 되나요?',
      answer: '동일 업로드에 대해 송장 재업로드는 멱등합니다. 새 송장만 갱신되며 기존 송장은 유지됩니다.',
      sort_order: 10,
    },
  ];

  for (const r of rows) {
    const { error } = await supabase.from('faqs').insert({
      ...r,
      created_by: owner.id,
      updated_by: owner.id,
    });
    if (error) console.error('Insert failed:', r.question, error.message);
    else console.log('Inserted:', r.question);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
