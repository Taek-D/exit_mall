/**
 * attachTrackingAction 안전망 테스트.
 *
 * lib/actions/admin-attach-tracking.ts (line 12-101)의 핵심 계약을 고정한다.
 * 특히 line 60-63의 product_id 인덱스 기반 보존 로직(AT-1, AT-2)은
 * 향후 헬퍼 분할 시 시그니처가 모호해지는 것을 막기 위해 명시적으로 검증한다.
 *
 *   const itemsWithProductId = parsed.items.map((it, i) => ({
 *     ...it,
 *     product_id: existing.items[i]?.product_id ?? null,
 *   }));
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  callRpc: vi.fn(),
  revalidatePaths: vi.fn(),
  parseShippingExcel: vi.fn(),
}));

vi.mock('@/lib/actions/_guards', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/actions/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/actions/_shared')>();
  return {
    ...actual,
    callRpc: mocks.callRpc,
    revalidatePaths: mocks.revalidatePaths,
  };
});

vi.mock('@/lib/shipping-upload-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/shipping-upload-parser')>();
  return {
    ...actual,
    parseShippingExcel: mocks.parseShippingExcel,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { attachTrackingAction } from '@/lib/actions/admin-attach-tracking';

const UPLOAD_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PRODUCT_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

// OOXML magic bytes - attach-tracking validates these explicitly
const PK_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function makeXlsxFile(name = 'tracking.xlsx', size = 1024): File {
  const buf = new Uint8Array(size);
  buf.set(PK_HEADER, 0);
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function makeFormData(file?: File | null): FormData {
  const fd = new FormData();
  if (file) fd.set('file', file);
  return fd;
}

function buildSupabase(opts: {
  existingRow?: {
    items: Array<{ product_id?: string; product_code?: string }>;
    status?: string;
    user_id?: string;
  } | null;
  storageUploadError?: { message: string } | null;
  storageRemoveError?: { message: string } | null;
}) {
  const upload = vi
    .fn()
    .mockResolvedValue({ error: opts.storageUploadError ?? null });
  const remove = vi
    .fn()
    .mockResolvedValue({ error: opts.storageRemoveError ?? null });

  const singleChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: opts.existingRow ?? null,
      error: opts.existingRow ? null : null,
    }),
  };

  return {
    client: {
      from: vi.fn(() => singleChain),
      storage: {
        from: vi.fn(() => ({ upload, remove })),
      },
    },
    upload,
    remove,
    singleChain,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================================
// Pre-validation branches
// ============================================================================

describe('attachTrackingAction - 사전 검증', () => {
  it('비관리자는 권한 에러를 반환한다', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result).toEqual({ ok: false, error: '관리자 권한이 필요합니다.' });
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('파일이 없거나 size=0이면 거부한다', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: buildSupabase({}).client,
      user: { id: ADMIN_ID },
    });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/송장 채운 엑셀 파일을 선택/);
    }
  });

  it('파일 크기가 5MB를 초과하면 거부한다', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: buildSupabase({}).client,
      user: { id: ADMIN_ID },
    });
    const bigFile = makeXlsxFile('big.xlsx', 5 * 1024 * 1024 + 1);

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(bigFile));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/5MB 이하/);
    }
  });

  it('.xlsx가 아닌 확장자는 거부한다', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: buildSupabase({}).client,
      user: { id: ADMIN_ID },
    });
    const xlsFile = new File([new Uint8Array(1024)], 'legacy.xls', {
      type: 'application/vnd.ms-excel',
    });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(xlsFile));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/\.xlsx/);
    }
  });

  it('OOXML magic bytes가 없으면 거부한다 (.xlsx 가짜 파일)', async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: buildSupabase({}).client,
      user: { id: ADMIN_ID },
    });
    const fakeXlsx = new File([new Uint8Array(1024)], 'fake.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(fakeXlsx));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/엑셀\(\.xlsx\) 파일 형식이 아닙니다/);
    }
  });
});

// ============================================================================
// AT-1, AT-2: 행 순서 가정 계약 (핵심)
// ============================================================================

describe('attachTrackingAction - 행 순서 product_id 인덱스 매핑 계약', () => {
  it('AT-2: parsed와 existing의 행 수가 다르면 거부한다', async () => {
    const sb = buildSupabase({
      existingRow: {
        items: [{ product_id: PRODUCT_A }, { product_id: PRODUCT_B }],
        status: 'approved',
        user_id: 'u1',
      },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    // parsed는 3행, existing은 2행 → 불일치
    mocks.parseShippingExcel.mockResolvedValue({
      items: [
        { no: 1, product_code: 'P1', quantity: 1 },
        { no: 2, product_code: 'P2', quantity: 1 },
        { no: 3, product_code: 'P3', quantity: 1 },
      ],
    });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/원본 2행과 새 파일 3행이 다릅니다/);
    }
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('AT-1: existing.items[i].product_id가 parsed.items 동일 인덱스에 적용된다', async () => {
    const sb = buildSupabase({
      existingRow: {
        items: [
          { product_id: PRODUCT_A, product_code: 'orig1' },
          { product_id: PRODUCT_B, product_code: 'orig2' },
          { product_id: PRODUCT_C, product_code: 'orig3' },
        ],
        status: 'approved',
        user_id: 'u1',
      },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    mocks.parseShippingExcel.mockResolvedValue({
      items: [
        { no: 1, product_code: 'new1', quantity: 1, tracking_number: 'T1' },
        { no: 2, product_code: 'new2', quantity: 2, tracking_number: 'T2' },
        { no: 3, product_code: 'new3', quantity: 3, tracking_number: 'T3' },
      ],
    });
    mocks.callRpc.mockResolvedValue({ data: null, error: null });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result).toEqual({ ok: true });
    expect(mocks.callRpc).toHaveBeenCalledWith(
      sb.client,
      'attach_tracking',
      expect.objectContaining({
        upload_id: UPLOAD_ID,
        parsed_items: [
          expect.objectContaining({ no: 1, product_id: PRODUCT_A, tracking_number: 'T1' }),
          expect.objectContaining({ no: 2, product_id: PRODUCT_B, tracking_number: 'T2' }),
          expect.objectContaining({ no: 3, product_id: PRODUCT_C, tracking_number: 'T3' }),
        ],
      }),
    );
  });

  it('AT-1 변형: existing.items[i].product_id가 없으면 null로 채워진다', async () => {
    const sb = buildSupabase({
      existingRow: {
        items: [
          { product_id: PRODUCT_A },
          { /* no product_id */ product_code: 'orig2' },
        ],
        status: 'approved',
        user_id: 'u1',
      },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    mocks.parseShippingExcel.mockResolvedValue({
      items: [
        { no: 1, product_code: 'new1', quantity: 1 },
        { no: 2, product_code: 'new2', quantity: 1 },
      ],
    });
    mocks.callRpc.mockResolvedValue({ data: null, error: null });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result).toEqual({ ok: true });
    const rpcArgs = mocks.callRpc.mock.calls[0][2];
    expect(rpcArgs.parsed_items[0].product_id).toBe(PRODUCT_A);
    expect(rpcArgs.parsed_items[1].product_id).toBeNull();
  });
});

// ============================================================================
// Status / not-found / RPC failure
// ============================================================================

describe('attachTrackingAction - 상태/RPC 분기', () => {
  it('upload row가 없으면 ok:false를 반환한다', async () => {
    const sb = buildSupabase({ existingRow: null });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    mocks.parseShippingExcel.mockResolvedValue({ items: [] });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/업로드를 찾을 수 없습니다/);
    }
  });

  it('status가 approved/shipped가 아니면 거부한다', async () => {
    const sb = buildSupabase({
      existingRow: {
        items: [{ product_id: PRODUCT_A }],
        status: 'pending',
        user_id: 'u1',
      },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    mocks.parseShippingExcel.mockResolvedValue({
      items: [{ no: 1, product_code: 'new1', quantity: 1 }],
    });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/현재 상태\(pending\)에서는 송장 등록이 불가합니다/);
    }
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('attach_tracking RPC 실패 시 storage cleanup(remove) 호출 + ok:false', async () => {
    const sb = buildSupabase({
      existingRow: {
        items: [{ product_id: PRODUCT_A }],
        status: 'approved',
        user_id: 'u1',
      },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    mocks.parseShippingExcel.mockResolvedValue({
      items: [{ no: 1, product_code: 'new1', quantity: 1 }],
    });
    mocks.callRpc.mockResolvedValue({
      data: null,
      error: { message: 'INVALID_TRACKING' },
    });

    const result = await attachTrackingAction(UPLOAD_ID, makeFormData(makeXlsxFile()));

    expect(result.ok).toBe(false);
    expect(sb.remove).toHaveBeenCalledTimes(1);
  });
});
