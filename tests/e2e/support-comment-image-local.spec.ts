import { expect, test, type Browser, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db-types';

type SeedUser = { id: string; email: string };

type SupportCommentImageSeed = {
  credential: string;
  admin: SeedUser;
  user: SeedUser;
  requestId: string;
};

const E2E_EMAIL_PREFIX = 'e2e.support-image.';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient<Database>;
let seed: SupportCommentImageSeed | null = null;

test.describe.configure({ mode: 'serial' });

test.describe('local support comment image attachments', () => {
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

  test('admin can post an image-only support comment that the requester can view', async ({
    page,
    browser,
  }) => {
    if (!seed) throw new Error('Seed was not created');

    await login(page, seed.admin.email, seed.credential);
    await page.goto(`/admin/support-requests/${seed.requestId}`);

    const adminForm = page
      .locator('form')
      .filter({ has: page.locator('textarea[name="body"]') })
      .last();
    await expect(adminForm.locator('input[name="image"]')).toBeVisible();
    await page.waitForTimeout(500);

    await adminForm.locator('input[name="image"]').setInputFiles({
      name: 'reply.png',
      mimeType: 'image/png',
      buffer: onePixelPng(),
    });
    const submit = adminForm.locator('button[type="submit"]');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.locator('img[alt="reply.png"]')).toBeVisible();

    await expect
      .poll(async () => {
        const { data, error } = await adminClient
          .from('support_request_comment_images')
          .select('original_name')
          .eq('request_id', seed!.requestId);
        if (error) throw error;
        return data?.map((row) => row.original_name) ?? [];
      })
      .toEqual(['reply.png']);

    const userPage = await newPageLoggedIn(browser, seed.user.email, seed.credential);
    await userPage.goto(`/support-requests/${seed.requestId}`);
    await expect(userPage.locator('img[alt="reply.png"]')).toBeVisible();
    await expect(userPage.locator('form input[name="image"]')).toHaveCount(0);
    await userPage.close();
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

async function newPageLoggedIn(browser: Browser, email: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email, password);
  return page;
}

async function createSeed(
  supabase: SupabaseClient<Database>,
): Promise<SupportCommentImageSeed> {
  const runId = Date.now();
  const credential = `E2E-${runId}-Aa1!`;

  const admin = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}admin.${runId}@example.com`,
    password: credential,
    role: 'admin',
    name: 'E2E Support Image Admin',
  });
  const user = await createUserWithProfile(supabase, {
    email: `${E2E_EMAIL_PREFIX}user.${runId}@example.com`,
    password: credential,
    role: 'user',
    name: 'E2E Support Image User',
  });

  const { data: request, error } = await supabase
    .from('support_requests')
    .insert({
      user_id: user.id,
      category: 'cs',
      title: `${E2E_EMAIL_PREFIX}${runId} request`,
      body: 'Local support comment image smoke request',
      reference_type: 'none',
      status: 'open',
      user_last_read_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error || !request) throw error ?? new Error('Support request seed failed');

  return { credential, admin, user, requestId: request.id };
}

async function createUserWithProfile(
  supabase: SupabaseClient<Database>,
  {
    email,
    password,
    role,
    name,
  }: {
    email: string;
    password: string;
    role: 'admin' | 'user';
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
    phone: `010-${String(Date.now()).slice(-4)}-${role === 'admin' ? '0001' : '0002'}`,
    role,
    status: 'active',
    user_group: 'group1',
    deposit_balance: 500_000,
    low_balance_threshold: 100_000,
  });
  if (profileError) throw profileError;

  return { id: data.user.id, email };
}

async function cleanupSeed(
  supabase: SupabaseClient<Database>,
  currentSeed: SupportCommentImageSeed,
) {
  const { data: imageRows } = await supabase
    .from('support_request_comment_images')
    .select('storage_path')
    .eq('request_id', currentSeed.requestId);
  if (imageRows?.length) {
    await supabase.storage
      .from('support-requests')
      .remove(imageRows.map((row) => row.storage_path));
  }

  await supabase.from('support_requests').delete().eq('id', currentSeed.requestId);
  await supabase.auth.admin.deleteUser(currentSeed.admin.id);
  await supabase.auth.admin.deleteUser(currentSeed.user.id);
}

async function cleanupUsersByEmailPrefix(
  supabase: SupabaseClient<Database>,
  prefix: string,
) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  for (const user of data.users) {
    if (user.email?.startsWith(prefix)) {
      await supabase.auth.admin.deleteUser(user.id);
    }
  }
}

function assertLocalSupabaseEnv() {
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(`Refusing non-local Supabase URL: ${supabaseUrl}`);
  }
}

function onePixelPng(): Buffer {
  return Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc0000003010100c9fe92ef0000000049454e44ae426082',
    'hex',
  );
}
