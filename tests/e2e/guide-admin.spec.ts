import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/db-types';

type SeedUser = { id: string; email: string };
type AdminGuideSeed = {
  credential: string;
  admin: SeedUser;
  group1: SeedUser;
  banner: SeedUser;
};

const E2E_EMAIL_PREFIX = 'e2e.guide-admin.';
const E2E_QUESTION_PREFIX = 'e2e-guide-admin';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient<Database>;
let seed: AdminGuideSeed;

test.describe.configure({ mode: 'serial' });

test.describe('local guide-admin: FAQ CRUD, permission, banner', () => {
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

  const QUESTION = `${E2E_QUESTION_PREFIX} 신규 등록 질문`;
  const QUESTION_EDITED = `${E2E_QUESTION_PREFIX} 수정된 질문`;

  test('admin creates a new FAQ via /admin/guide/faq/manage/new', async ({ page }) => {
    await login(page, seed.admin.email, seed.credential);
    await page.goto('/admin/guide/faq/manage/new');
    await expect(page.getByRole('heading', { name: '새 FAQ 등록' })).toBeVisible();
    await page.locator('#faq-category').selectOption('purchase');
    await page.getByLabel(/^질문/).fill(QUESTION);
    await page.getByLabel(/^답변/).fill('테스트 답변 본문입니다.');
    await page.getByRole('button', { name: '등록' }).click();
    await expect(page).toHaveURL(/\/admin\/guide\/faq\/manage$/);
    await expect(page.getByText(QUESTION)).toBeVisible();
  });

  test('admin edits the FAQ', async ({ page }) => {
    await login(page, seed.admin.email, seed.credential);
    await page.goto('/admin/guide/faq/manage');
    await page.getByRole('row', { name: new RegExp(QUESTION) })
      .getByRole('link', { name: '수정' })
      .click();
    await expect(page.getByRole('heading', { name: 'FAQ 수정' })).toBeVisible();
    await page.getByLabel(/^질문/).fill(QUESTION_EDITED);
    await page.getByRole('button', { name: '저장' }).click();
    await expect(page).toHaveURL(/\/admin\/guide\/faq\/manage$/);
    await expect(page.getByText(QUESTION_EDITED)).toBeVisible();
  });

  test('admin deletes the FAQ via native confirm', async ({ page }) => {
    await login(page, seed.admin.email, seed.credential);
    await page.goto('/admin/guide/faq/manage');
    page.once('dialog', d => d.accept());
    await page.getByRole('row', { name: new RegExp(QUESTION_EDITED) })
      .getByRole('button', { name: '삭제' })
      .click();
    await expect(page.getByText(QUESTION_EDITED)).toHaveCount(0);
  });

  test('non-admin (group1) is redirected away from /admin/guide/faq/manage', async ({ page }) => {
    await login(page, seed.group1.email, seed.credential);
    await page.goto('/admin/guide/faq/manage');
    await expect(page).not.toHaveURL(/\/admin\/guide\/faq\/manage$/);
  });

  test('first-load banner shows for fresh group1 user, dismiss persists across reload', async ({ page }) => {
    await adminClient.from('profiles')
      .update({ guide_banner_dismissed_at: null })
      .eq('id', seed.banner.id);
    await login(page, seed.banner.email, seed.credential);
    await page.goto('/shop');
    const bannerText = page.getByText('처음이시면 가이드를 먼저 읽어보세요');
    await expect(bannerText).toBeVisible();
    await page.getByRole('button', { name: '닫기' }).click();
    await expect(bannerText).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('처음이시면 가이드를 먼저 읽어보세요')).toHaveCount(0);
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
    throw new Error('E2E_ALLOW_REMOTE_SUPABASE=1 is not allowed for guide-admin spec.');
  }
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`Refusing to run guide-admin E2E against non-local Supabase: ${supabaseUrl}`);
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

async function createSeed(supabase: SupabaseClient<Database>): Promise<AdminGuideSeed> {
  const runId = Date.now();
  const credential = `E2E-${runId}-${randomUUID().replaceAll('-', '').slice(0, 18)}!Aa1`;

  const admin = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}admin.${runId}@example.com`,
    password: credential, role: 'admin', group: 'group1', name: 'E2E GuideAdmin Admin',
  });
  const group1 = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}group1.${runId}@example.com`,
    password: credential, role: 'user', group: 'group1', name: 'E2E GuideAdmin Group1',
  });
  const banner = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}banner.${runId}@example.com`,
    password: credential, role: 'user', group: 'group1', name: 'E2E GuideAdmin Banner',
  });
  return { credential, admin, group1, banner };
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

async function cleanupSeed(supabase: SupabaseClient<Database>, current: AdminGuideSeed) {
  await supabase.from('faqs').delete().like('question', `${E2E_QUESTION_PREFIX}%`);
  for (const u of [current.admin, current.group1, current.banner]) {
    await supabase.auth.admin.deleteUser(u.id);
  }
}
