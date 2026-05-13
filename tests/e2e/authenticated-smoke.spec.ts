import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Database } from '@/lib/db-types';

type QaSeed = {
  credential: string;
  customer: { id: string; email: string };
  admin: { id: string; email: string };
  product: { id: string; name: string };
};

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowRemoteSupabase = process.env.E2E_ALLOW_REMOTE_SUPABASE === '1';
const canSeed =
  Boolean(supabaseUrl && serviceKey) &&
  (allowRemoteSupabase || Boolean(supabaseUrl && /^https?:\/\/(127\.0\.0\.1|localhost)/.test(supabaseUrl)));

let seed: QaSeed;
let adminClient: SupabaseClient<Database>;

test.describe.configure({ mode: 'serial' });

test('unauthenticated protected routes redirect to login', async ({ page }) => {
  for (const route of ['/shop', '/orders', '/admin/products', '/admin/orders']) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
  }
});

test.describe('authenticated smoke', () => {
  test.skip(!canSeed, 'Authenticated E2E requires local Supabase service role config or E2E_ALLOW_REMOTE_SUPABASE=1');

  test.beforeAll(async () => {
    adminClient = createClient<Database>(supabaseUrl!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    seed = await createQaSeed(adminClient);
  });

  test('customer can request a stock order and see it in order history', async ({ page }) => {
    await login(page, seed.customer.email, seed.credential);

    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.getByText(seed.product.name)).toBeVisible();

    await page.getByLabel(`${seed.product.name} 장바구니 담기`).click();
    await page.getByRole('link', { name: '장바구니' }).click();
    await expect(page.getByRole('heading', { name: '장바구니' })).toBeVisible();
    await expect(page.getByText(seed.product.name)).toBeVisible();

    await page.getByRole('link', { name: /주문하기/ }).click();
    await expect(page.getByRole('heading', { name: '검토 요청' })).toBeVisible();
    await page.getByRole('button', { name: /검토 요청/ }).click();

    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByText(seed.product.name)).toBeVisible();
    await expect(page.getByText('검토대기').first()).toBeVisible();
  });

  test('admin can see the requested order and enter the detail page', async ({ page }) => {
    const orderId = await latestStockOrderId(adminClient, seed.customer.id);

    await login(page, seed.admin.email, seed.credential);
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/products');
    await expect(page.getByText(seed.product.name)).toBeVisible();

    await page.goto('/admin/orders');
    await expect(page.getByText(seed.product.name)).toBeVisible();

    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByText(seed.product.name)).toBeVisible();
    await expect(page.getByRole('button', { name: /승인/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /반려/ })).toBeVisible();
  });

  test('shipping upload screen renders template and history surfaces', async ({ page }) => {
    await login(page, seed.customer.email, seed.credential);
    await page.goto('/shipping-uploads/exitmall');

    await expect(page.getByRole('heading', { name: '엑시트몰 배송대행' })).toBeVisible();
    await expect(page.getByRole('link', { name: /양식 받기/ })).toHaveAttribute(
      'href',
      '/shipping-template.xlsx',
    );
    await expect(page.getByText(/최근 업로드|업로드 내역이 없습니다/)).toBeVisible();
  });
});

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: /^로그인$/ }).click();
}

async function createQaSeed(supabase: SupabaseClient<Database>): Promise<QaSeed> {
  const runId = Date.now();
  const credential = buildE2eCredential(runId);
  const customerEmail = `e2e.customer.${runId}@example.com`;
  const adminEmail = `e2e.admin.${runId}@example.com`;
  const productName = `E2E Refactor Product ${runId}`;

  const customer = await createUserWithProfile(supabase, {
    email: customerEmail,
    password: credential,
    role: 'user',
    name: 'E2E Customer',
    balance: 500_000,
  });
  const admin = await createUserWithProfile(supabase, {
    email: adminEmail,
    password: credential,
    role: 'admin',
    name: 'E2E Admin',
    balance: 0,
  });

  const { data: product, error: productError } = await supabase
    .from('products')
    .insert({
      name: productName,
      description: 'E2E smoke product',
      price: 12000,
      stock: 20,
      is_active: true,
      image_url: null,
      per_user_limit: null,
    })
    .select('id,name')
    .single();
  if (productError || !product) throw productError ?? new Error('Product seed failed');

  return {
    credential,
    customer: { id: customer.id, email: customerEmail },
    admin: { id: admin.id, email: adminEmail },
    product: { id: product.id, name: product.name },
  };
}

function buildE2eCredential(runId: number) {
  const token = randomUUID().replaceAll('-', '').slice(0, 18);
  return `E2E-${runId}-${token}!Aa1`;
}

async function createUserWithProfile(
  supabase: SupabaseClient<Database>,
  {
    email,
    password,
    role,
    name,
    balance,
  }: {
    email: string;
    password: string;
    role: 'user' | 'admin';
    name: string;
    balance: number;
  },
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone: '010-0000-0000' },
  });
  if (error || !data.user) throw error ?? new Error('User seed failed');

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: data.user.id,
    email,
    name,
    phone: `010-${randomUUID().slice(0, 4)}-${randomUUID().slice(0, 4)}`,
    role,
    status: 'active',
    deposit_balance: balance,
    low_balance_threshold: 100000,
  });
  if (profileError) throw profileError;

  return data.user;
}

async function latestStockOrderId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('stock_orders')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) throw error ?? new Error('No stock order found');
  return data.id;
}

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
    process.env[key] ??= value;
  }
}
