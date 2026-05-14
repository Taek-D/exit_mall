import { expect, test, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/db-types';

type SeedUser = { id: string; email: string };

type UserGroupSeed = {
  credential: string;
  admin: SeedUser;
  pending: SeedUser;
  group1: SeedUser;
};

const E2E_EMAIL_PREFIX = 'e2e.user-groups.';
const BLOCKED_GROUP2_ROUTES = [
  '/shop',
  '/cart',
  '/orders',
  '/deposit',
  '/inventory',
  '/shipping-uploads/exitmall',
];
const ALLOWED_GROUP2_ROUTES = [
  '/shipping-uploads/purchased',
  '/inbound-requests',
  '/account/password',
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient<Database>;
let seed: UserGroupSeed;

test.describe.configure({ mode: 'serial' });

test.describe('local user-group access control', () => {
  test.beforeAll(async () => {
    assertLocalSupabaseEnv();
    adminClient = createClient<Database>(supabaseUrl!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await cleanupUsersByEmailPrefix(adminClient, E2E_EMAIL_PREFIX);
    seed = await createSeed(adminClient);
  });

  test.afterAll(async () => {
    if (!adminClient || !seed) return;
    await cleanupSeed(adminClient, seed);
  });

  test('pending signup requires a group before approval and stores group2 on approval', async ({ page }) => {
    await login(page, seed.admin.email, seed.credential);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/approvals');
    const row = approvalRow(page, seed.pending.email);

    await expect(row.getByRole('button', { name: '승인' })).toBeDisabled();
    await row.getByLabel('그룹 선택').click();
    await page.getByRole('option', { name: /2그룹/ }).click();
    await expect(row.getByRole('button', { name: '승인' })).toBeEnabled();
    await row.getByRole('button', { name: '승인' }).click();

    await expect.poll(async () => {
      const { data } = await adminClient
        .from('profiles')
        .select('status,user_group')
        .eq('id', seed.pending.id)
        .single();
      return `${data?.status}:${data?.user_group}`;
    }).toBe('active:group2');
  });

  test('group2 user lands on purchased shipping and only sees the two allowed primary menu links', async ({ page }) => {
    await login(page, seed.pending.email, seed.credential);

    await expect(page).toHaveURL(/\/shipping-uploads\/purchased$/);
    const primaryLinks = primaryUserNavLinks(page);
    await expect(primaryLinks).toHaveCount(2);
    await expect(primaryLinks.filter({ hasText: '사입재고 배송대행' })).toBeVisible();
    await expect(primaryLinks.filter({ hasText: '입고리스트' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^상품$/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^예치금$/ })).toHaveCount(0);
  });

  test('group2 user is redirected away from group1-only routes', async ({ page }) => {
    await login(page, seed.pending.email, seed.credential);

    for (const route of BLOCKED_GROUP2_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/shipping-uploads\/purchased$/);
    }
  });

  test('group2 user can access purchased shipping, inbound requests, and account password', async ({ page }) => {
    await login(page, seed.pending.email, seed.credential);

    for (const route of ALLOWED_GROUP2_ROUTES) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route)}$`));
    }
  });

  test('admin self detail page does not render the group change form', async ({ page }) => {
    await login(page, seed.admin.email, seed.credential);

    await page.goto(`/admin/users/${seed.admin.id}`);
    await expect(page.getByRole('heading', { name: '그룹' })).toHaveCount(0);
  });

  test('admin changes a group2 user to group1 and the next user page load shows full access', async ({ page, browser }) => {
    await login(page, seed.admin.email, seed.credential);

    await page.goto(`/admin/users/${seed.pending.id}`);
    const groupSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: '그룹' }),
    });
    await groupSection.getByLabel(/1그룹/).check();
    await groupSection.getByRole('button', { name: '변경' }).click();

    await expect.poll(async () => {
      const { data } = await adminClient
        .from('profiles')
        .select('user_group')
        .eq('id', seed.pending.id)
        .single();
      return data?.user_group;
    }).toBe('group1');

    const userPage = await newPageLoggedIn(browser, seed.pending.email, seed.credential);
    await userPage.goto('/shop');
    await expect(userPage).toHaveURL(/\/shop$/);
    await expect(primaryUserNavLinks(userPage)).toHaveCount(8);
    await expect(userPage.getByRole('link', { name: /^상품$/ })).toBeVisible();
    await userPage.close();
  });

  test('existing active group1 user keeps the original full-access behavior', async ({ page }) => {
    await login(page, seed.group1.email, seed.credential);

    await expect(page).toHaveURL(/\/shop$/);
    await expect(primaryUserNavLinks(page)).toHaveCount(8);

    for (const route of ['/shop', '/cart', '/orders', '/deposit', '/inventory', '/shipping-uploads/exitmall']) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route)}$`));
    }
  });
});

function assertLocalSupabaseEnv() {
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE === '1') {
    throw new Error('E2E_ALLOW_REMOTE_SUPABASE=1 is not allowed for this local-only spec.');
  }
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`Refusing to run user-group E2E against non-local Supabase: ${supabaseUrl}`);
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^로그인$/ }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

async function newPageLoggedIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  return page;
}

function approvalRow(page: Page, email: string) {
  return page
    .getByText(email)
    .locator('xpath=ancestor::div[contains(@class, "hover:bg-surface-muted")][1]');
}

function primaryUserNavLinks(page: Page) {
  return page.locator('header nav').first().getByRole('link');
}

async function createSeed(supabase: SupabaseClient<Database>): Promise<UserGroupSeed> {
  const runId = Date.now();
  const credential = `E2E-${runId}-${randomUUID().replaceAll('-', '').slice(0, 18)}!Aa1`;

  const admin = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}admin.${runId}@example.com`,
    password: credential,
    role: 'admin',
    status: 'active',
    group: 'group1',
    name: 'E2E User Groups Admin',
  });
  const pending = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}pending.${runId}@example.com`,
    password: credential,
    role: 'user',
    status: 'pending',
    group: null,
    name: 'E2E User Groups Pending',
  });
  const group1 = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}group1.${runId}@example.com`,
    password: credential,
    role: 'user',
    status: 'active',
    group: 'group1',
    name: 'E2E User Groups Group1',
  });

  return { credential, admin, pending, group1 };
}

async function createUserWithProfile(
  supabase: SupabaseClient<Database>,
  {
    email,
    password,
    role,
    status,
    group,
    name,
  }: {
    email: string;
    password: string;
    role: 'admin' | 'user';
    status: 'active' | 'pending';
    group: 'group1' | 'group2' | null;
    name: string;
  },
): Promise<SeedUser> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone: '010-0000-0000' },
  });
  if (error || !data.user) throw error ?? new Error(`User seed failed for ${email}`);

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id,
    email,
    name,
    phone: `010-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`,
    role,
    status,
    user_group: group,
    deposit_balance: 500_000,
    low_balance_threshold: 100_000,
  });
  if (profileError) throw profileError;

  return { id: data.user.id, email };
}

async function cleanupSeed(supabase: SupabaseClient<Database>, currentSeed: UserGroupSeed) {
  for (const user of [currentSeed.admin, currentSeed.pending, currentSeed.group1]) {
    await supabase.auth.admin.deleteUser(user.id);
  }
}

async function cleanupUsersByEmailPrefix(supabase: SupabaseClient<Database>, prefix: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  for (const user of data.users) {
    if (user.email?.startsWith(prefix)) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
