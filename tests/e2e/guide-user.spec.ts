import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/db-types';

type SeedUser = { id: string; email: string };
type GuideSeed = {
  credential: string;
  admin: SeedUser;
  group1: SeedUser;
  group2: SeedUser;
  faqIds: string[];
};

const E2E_EMAIL_PREFIX = 'e2e.guide-user.';
const E2E_QUESTION_PREFIX = 'e2e-guide-user';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient<Database>;
let seed: GuideSeed;

test.describe.configure({ mode: 'serial' });

test.describe('local guide visibility by user group', () => {
  test.beforeAll(async () => {
    assertLocalSupabaseEnv();
    adminClient = createClient<Database>(supabaseUrl!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await cleanupOrphans(adminClient);
    seed = await createSeed(adminClient);
  });

  test.afterAll(async () => {
    if (!adminClient || !seed) return;
    await cleanupSeed(adminClient, seed);
  });

  test('group1 user sees Group1Guide content on /guide', async ({ page }) => {
    await login(page, seed.group1.email, seed.credential);
    await page.goto('/guide');
    await expect(page.locator('section#purchase')).toBeVisible();
  });

  test('group1 user sees their FAQ on /guide/faq', async ({ page }) => {
    await login(page, seed.group1.email, seed.credential);
    await page.goto('/guide/faq');
    await expect(page.getByText(`${E2E_QUESTION_PREFIX} 검토대기 취소`)).toBeVisible();
  });

  test('group2 user sees Group2Guide content and not Group1Guide content', async ({ page }) => {
    await login(page, seed.group2.email, seed.credential);
    await page.goto('/guide');
    await expect(page.locator('section#shipping-upload')).toBeVisible();
    await expect(page.locator('section#purchase')).toHaveCount(0);
  });

  test('group2 user cannot use ?as=group1 to view Group1Guide', async ({ page }) => {
    await login(page, seed.group2.email, seed.credential);
    await page.goto('/guide?as=group1');
    await expect(page.locator('section#purchase')).toHaveCount(0);
    await expect(page.locator('section#shipping-upload')).toBeVisible();
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^로그인$/ }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

function assertLocalSupabaseEnv() {
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE === '1') {
    throw new Error('E2E_ALLOW_REMOTE_SUPABASE=1 is not allowed for guide-user spec.');
  }
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`Refusing to run guide-user E2E against non-local Supabase: ${supabaseUrl}`);
  }
}

async function cleanupOrphans(supabase: SupabaseClient<Database>) {
  await supabase.from('faqs').delete().like('question', `${E2E_QUESTION_PREFIX}%`);
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  for (const user of data.users) {
    if (user.email?.startsWith(E2E_EMAIL_PREFIX)) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  }
}

async function createSeed(supabase: SupabaseClient<Database>): Promise<GuideSeed> {
  const runId = Date.now();
  const credential = `E2E-${runId}-${randomUUID().replaceAll('-', '').slice(0, 18)}!Aa1`;

  const admin = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}admin.${runId}@example.com`,
    password: credential, role: 'admin', group: 'group1', name: 'E2E Guide Admin',
  });
  const group1 = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}group1.${runId}@example.com`,
    password: credential, role: 'user', group: 'group1', name: 'E2E Guide Group1',
  });
  const group2 = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}group2.${runId}@example.com`,
    password: credential, role: 'user', group: 'group2', name: 'E2E Guide Group2',
  });

  const faqRows = [
    {
      audience: 'user' as const, user_groups: ['group1'], category: 'purchase',
      question: `${E2E_QUESTION_PREFIX} 검토대기 취소`,
      answer: '검토대기 단계에서는 예치금이 차감되지 않고 예약만 되어 있어, 취소 즉시 가용 잔액으로 돌아갑니다.',
      sort_order: 10, created_by: admin.id, updated_by: admin.id,
    },
    {
      audience: 'user' as const, user_groups: ['group1', 'group2'], category: 'inbound',
      question: `${E2E_QUESTION_PREFIX} 입고 요청 비공개`,
      answer: '본인과 관리자만 열람할 수 있는 비공개 게시글입니다.',
      sort_order: 10, created_by: admin.id, updated_by: admin.id,
    },
  ];
  const { data: insertedFaqs, error: faqErr } = await supabase
    .from('faqs').insert(faqRows).select('id');
  if (faqErr || !insertedFaqs) throw faqErr ?? new Error('FAQ seed failed');

  return { credential, admin, group1, group2, faqIds: insertedFaqs.map(r => r.id) };
}

async function createUserWithProfile(
  supabase: SupabaseClient<Database>,
  { email, password, role, group, name }: {
    email: string; password: string;
    role: 'admin' | 'user'; group: 'group1' | 'group2' | null; name: string;
  },
): Promise<SeedUser> {
  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { name, phone: '010-0000-0000' },
  });
  if (error || !data.user) throw error ?? new Error(`User seed failed for ${email}`);

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id, email, name,
    phone: `010-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`,
    role, status: 'active',
    user_group: group,
    deposit_balance: 500_000, low_balance_threshold: 100_000,
  });
  if (profileError) throw profileError;
  return { id: data.user.id, email };
}

async function cleanupSeed(supabase: SupabaseClient<Database>, current: GuideSeed) {
  if (current.faqIds.length > 0) {
    await supabase.from('faqs').delete().in('id', current.faqIds);
  }
  for (const u of [current.admin, current.group1, current.group2]) {
    await supabase.auth.admin.deleteUser(u.id);
  }
}
