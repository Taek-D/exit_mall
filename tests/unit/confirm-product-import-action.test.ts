/**
 * confirmProductImportAction 안전망 테스트.
 *
 * lib/actions/admin-product-imports.ts (line 147-278, 130줄)의 거대 함수 분할 전에
 * 핵심 분기를 계약으로 고정한다.
 *
 * 특히 P-9 시나리오(RPC 실패 후 이미지 cleanup + status='failed' 업데이트)는
 * Phase 2.4의 ④applyProductImport 단계가 분리될 때 cleanup 누락 위험을 막는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlannedProductImportRow,
  ProductImportPreview,
} from '@/lib/product-import-planner';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  callRpc: vi.fn(),
  mutationTable: vi.fn(),
  revalidatePaths: vi.fn(),
  parseProductImportExcel: vi.fn(),
}));

vi.mock('@/lib/actions/_guards', () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock('@/lib/actions/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/actions/_shared')>();
  return {
    ...actual,
    callRpc: mocks.callRpc,
    mutationTable: mocks.mutationTable,
    revalidatePaths: mocks.revalidatePaths,
  };
});

vi.mock('@/lib/product-import-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/product-import-parser')>();
  return {
    ...actual,
    parseProductImportExcel: mocks.parseProductImportExcel,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { confirmProductImportAction } from '@/lib/actions/admin-product-imports';

const IMPORT_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

function makeRow(overrides: Partial<PlannedProductImportRow> = {}): PlannedProductImportRow {
  return {
    rowNumber: 2,
    action: 'create',
    existingProductId: null,
    existingProductName: null,
    brand: null,
    productName: '테스트 상품',
    optionName: null,
    displayName: '테스트 상품',
    importKey: '테스트 상품',
    price: 10000,
    managementCode: null,
    category: null,
    barcode: null,
    memo: null,
    hasImage: false,
    errors: [],
    warnings: [],
    ...overrides,
  };
}

function makePreview(rows: PlannedProductImportRow[]): ProductImportPreview {
  return {
    rows,
    summary: {
      total: rows.length,
      create: rows.filter((r) => r.action === 'create').length,
      update: rows.filter((r) => r.action === 'update').length,
      restore: rows.filter((r) => r.action === 'restore').length,
      error: rows.filter((r) => r.action === 'error').length,
      warningRows: rows.filter((r) => r.warnings.length > 0).length,
    },
  };
}

type StorageBucketMethods = {
  upload: ReturnType<typeof vi.fn>;
  download: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  getPublicUrl: ReturnType<typeof vi.fn>;
};

function buildSupabase(opts: {
  importRow?: {
    id?: string;
    status?: string;
    storage_path?: string;
    original_name?: string;
    preview?: unknown;
  };
  bucketImports?: Partial<StorageBucketMethods>;
  bucketImages?: Partial<StorageBucketMethods>;
}) {
  const importsBucket: StorageBucketMethods = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    download: vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array(1024)]),
      error: null,
    }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn(),
    ...opts.bucketImports,
  };
  const imagesBucket: StorageBucketMethods = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    download: vi.fn(),
    remove: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({
      data: { publicUrl: 'https://example.test/img.jpg' },
    }),
    ...opts.bucketImages,
  };

  const importRow = opts.importRow
    ? {
        id: opts.importRow.id ?? IMPORT_ID,
        status: opts.importRow.status ?? 'preview',
        storage_path: opts.importRow.storage_path ?? 'admin/imports/file.xlsx',
        original_name: opts.importRow.original_name ?? 'file.xlsx',
        preview: opts.importRow.preview,
      }
    : null;

  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: importRow,
      error: importRow ? null : { message: 'not found' },
    }),
  };

  return {
    client: {
      from: vi.fn((table: string) => {
        if (table === 'product_imports') return selectChain;
        return selectChain;
      }),
      storage: {
        from: vi.fn((bucket: string) => {
          if (bucket === 'product-imports') return importsBucket;
          if (bucket === 'product-images') return imagesBucket;
          return importsBucket;
        }),
      },
    },
    importsBucket,
    imagesBucket,
    selectChain,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parseProductImportExcel.mockResolvedValue({
    rows: [{ rowNumber: 2, image: undefined }],
  });
});

// ============================================================================
// Pre-RPC guard branches (P-1 ~ P-4)
// ============================================================================

describe('confirmProductImportAction - 사전 검증 분기', () => {
  it('P-1: 비관리자는 권한 에러를 반환한다', async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, error: '관리자 권한이 필요합니다.' });

    const result = await confirmProductImportAction(IMPORT_ID);

    expect(result).toEqual({ ok: false, error: '관리자 권한이 필요합니다.' });
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('P-3: status !== "preview" 인 import는 거부한다', async () => {
    const sb = buildSupabase({
      importRow: { status: 'imported', preview: makePreview([makeRow()]) },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });

    const result = await confirmProductImportAction(IMPORT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/이미 적용되었거나|실패 처리/);
    }
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('P-4: preview rows에 errors가 있으면 적용을 거부한다', async () => {
    const errorRow = makeRow({ errors: ['가격이 잘못됨'], action: 'error' });
    const sb = buildSupabase({
      importRow: { preview: makePreview([errorRow]) },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });

    const result = await confirmProductImportAction(IMPORT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/오류가 있는 행/);
    }
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Happy path (P-7)
// ============================================================================

describe('confirmProductImportAction - 정상 경로', () => {
  it('P-7: 이미지 없는 정상 경로 → apply RPC 성공 + result update + ok:true', async () => {
    const row = makeRow();
    const sb = buildSupabase({
      importRow: { preview: makePreview([row]) },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    mocks.callRpc.mockResolvedValue({
      data: { created: 1, updated: 0, restored: 0 },
      error: null,
    });

    // result update용 mutationTable 체인
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await confirmProductImportAction(IMPORT_ID);

    expect(result).toEqual({
      ok: true,
      created: 1,
      updated: 0,
      restored: 0,
      warnings: [],
    });
    expect(mocks.callRpc).toHaveBeenCalledWith(
      sb.client,
      'apply_product_import',
      expect.objectContaining({ rows: expect.any(Array) }),
    );
    // status='imported'로 업데이트되었는지 검증
    expect(updateChain.update).toHaveBeenCalled();
    const updatePayload = updateChain.update.mock.calls[0][0];
    expect(updatePayload.status).toBe('imported');
    expect(updatePayload.imported_at).toBeTruthy();
    // 이미지 cleanup은 호출되지 않아야 한다
    expect(sb.imagesBucket.remove).not.toHaveBeenCalled();
  });
});

// ============================================================================
// RPC failure + image cleanup (P-9)
// ============================================================================

describe('confirmProductImportAction - RPC 실패 + 이미지 cleanup', () => {
  it('P-9: apply RPC 실패 → 업로드된 이미지 cleanup + status="failed" 업데이트 + ok:false', async () => {
    const row = makeRow({ rowNumber: 2, hasImage: true });
    const sb = buildSupabase({
      importRow: { preview: makePreview([row]) },
    });
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      supabase: sb.client,
      user: { id: ADMIN_ID },
    });
    // parseProductImportExcel: rowNumber=2 에 이미지가 있음
    mocks.parseProductImportExcel.mockResolvedValue({
      rows: [
        {
          rowNumber: 2,
          image: {
            extension: 'jpg',
            buffer: Buffer.from([0xff, 0xd8, 0xff]),
            contentType: 'image/jpeg',
          },
        },
      ],
    });
    // apply RPC 실패
    mocks.callRpc.mockResolvedValue({
      data: null,
      error: { message: 'AMBIGUOUS_PRODUCT_NAME:테스트상품' },
    });

    // status='failed' 업데이트용 mutationTable
    const failUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(failUpdateChain);

    const result = await confirmProductImportAction(IMPORT_ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/여러 개 있어 적용할 수 없습니다/);
    }
    // 이미지 cleanup이 호출되어야 한다 — 이것이 핵심 계약
    expect(sb.imagesBucket.remove).toHaveBeenCalledTimes(1);
    const removeArg = sb.imagesBucket.remove.mock.calls[0][0];
    expect(Array.isArray(removeArg)).toBe(true);
    expect(removeArg.length).toBe(1);
    expect(removeArg[0]).toContain(IMPORT_ID);
    expect(removeArg[0]).toContain('row-2.jpg');
    // status='failed'로 업데이트되었는지 검증
    expect(failUpdateChain.update).toHaveBeenCalled();
    const updatePayload = failUpdateChain.update.mock.calls[0][0];
    expect(updatePayload.status).toBe('failed');
    expect(updatePayload.error_message).toMatch(/AMBIGUOUS_PRODUCT_NAME/);
  });
});
