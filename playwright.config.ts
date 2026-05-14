import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

loadLocalE2eEnv();
assertLocalSupabaseEnv();

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

function loadLocalE2eEnv() {
  const envPath = path.resolve(__dirname, '.env.e2e.local');
  if (!fs.existsSync(envPath)) {
    // 원격 모드(authenticated-smoke 등)에서는 .env.e2e.local이 없어도 된다 —
    // 환경 변수나 CI secrets가 직접 주입된다. 로컬 강제는 어디까지나 user-group
    // 검증처럼 명시적으로 로컬을 쓰는 경로에만 해당한다.
    if (process.env.E2E_ALLOW_REMOTE_SUPABASE === '1') return;
    throw new Error(
      '.env.e2e.local is required for Playwright E2E so tests cannot accidentally use remote Supabase.',
    );
  }

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    process.env[key] = value;
  }
}

function assertLocalSupabaseEnv() {
  // 기존 authenticated-smoke.spec.ts는 E2E_ALLOW_REMOTE_SUPABASE=1로 원격 모드를
  // 지원한다. 명시적으로 옵트-인된 경우에는 로컬 강제를 건너뛴다 — 그 외에는
  // user-group 검증처럼 로컬 Supabase가 필수다.
  if (process.env.E2E_ALLOW_REMOTE_SUPABASE === '1') return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set in .env.e2e.local.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL is invalid: ${url}`);
  }

  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) {
    throw new Error(
      `Playwright E2E must use local Supabase only. Refusing NEXT_PUBLIC_SUPABASE_URL=${url}`,
    );
  }
}
