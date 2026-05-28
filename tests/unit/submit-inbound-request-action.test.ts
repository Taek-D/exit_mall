/**
 * submitInboundRequestAction 안전망 테스트.
 *
 * 이 테스트는 lib/actions/inbound-request.ts 의 거대 함수
 * (분할 이후 prepareInboundUploads / submitInboundRequestRpc /
 * renameInboundUploadsToCanonical 3단으로 나뉨)의 동작을 계약으로 고정한다.
 *
 * 특히 renameInboundUploadsToCanonical 내부의
 * rename → DB update → rollback → chase-update 4겹 분기를
 * 액션 레벨에서 검증한다.
 *
 * 인증은 requireSignedIn 가드를 mock으로 주입한다 (Phase 2.3 적용).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSignedIn: vi.fn(),
  validateExcelUpload: vi.fn(),
  safeStorageName: vi.fn(),
  safeFilename: vi.fn(),
  parseInboundInventoryExcel: vi.fn(),
  callRpc: vi.fn(),
  mutationTable: vi.fn(),
  revalidatePaths: vi.fn(),
}));

vi.mock('@/lib/actions/_guards', () => ({
  requireSignedIn: mocks.requireSignedIn,
}));

vi.mock('@/lib/files/excel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/files/excel')>();
  return {
    ...actual,
    validateExcelUpload: mocks.validateExcelUpload,
    safeStorageName: mocks.safeStorageName,
  };
});

vi.mock('@/lib/inbound/storage', () => ({
  safeFilename: mocks.safeFilename,
}));

vi.mock('@/lib/purchased-shipping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/purchased-shipping')>();
  return {
    ...actual,
    parseInboundInventoryExcel: mocks.parseInboundInventoryExcel,
  };
});

vi.mock('@/lib/actions/_shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/actions/_shared')>();
  return {
    ...actual,
    callRpc: mocks.callRpc,
    mutationTable: mocks.mutationTable,
    revalidatePaths: mocks.revalidatePaths,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { submitInboundRequestAction } from '@/lib/actions/inbound-request';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

type StorageMethod = ReturnType<typeof vi.fn>;
interface StorageMethods {
  upload: StorageMethod;
  move: StorageMethod;
  remove: StorageMethod;
}

function buildSupabase(opts: { storage?: Partial<StorageMethods> } = {}) {
  const storage: StorageMethods = {
    upload: vi.fn().mockResolvedValue({ error: null }),
    move: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    ...opts.storage,
  };
  return {
    client: {
      storage: {
        from: vi.fn(() => storage),
      },
    },
    storage,
  };
}

function setSignedIn(client: ReturnType<typeof buildSupabase>['client'], userId = USER_ID) {
  mocks.requireSignedIn.mockResolvedValue({
    ok: true,
    supabase: client,
    user: { id: userId },
    profile: { role: 'user', status: 'active' },
  });
}

function setUnauthenticated(error = '로그인이 필요합니다.') {
  mocks.requireSignedIn.mockResolvedValue({ ok: false, error });
}

function buildFormData(opts: {
  title?: string;
  body?: string;
  excel?: File | null;
  images?: (File | null)[];
} = {}): FormData {
  const fd = new FormData();
  if (opts.title !== undefined) fd.set('title', opts.title);
  if (opts.body !== undefined) fd.set('body', opts.body);
  if (opts.excel) fd.set('excel', opts.excel);
  (opts.images ?? []).forEach((img, i) => {
    if (img) fd.set(`image${i}`, img);
  });
  return fd;
}

function makeFile(name: string, size = 100, type = 'application/octet-stream'): File {
  return new File([new Uint8Array(size)], name, { type });
}

const defaultExcelFile = () => makeFile('inbound.xlsx', 1024);
const defaultExcelBuffer = () => Buffer.from(new Uint8Array(1024));

function setupSuccessfulValidation() {
  mocks.validateExcelUpload.mockResolvedValue({
    ok: true,
    file: defaultExcelFile(),
    buffer: defaultExcelBuffer(),
  });
  mocks.parseInboundInventoryExcel.mockResolvedValue([
    { row_number: 2, product_name: '상품A', quantity: 1 },
  ]);
  mocks.safeStorageName.mockImplementation((name: string) => name.replace(/[^\w.\-]+/g, '_'));
  mocks.safeFilename.mockImplementation((name: string) => name.replace(/[^\w.\-]+/g, '_'));
}

beforeEach(() => {
  vi.clearAllMocks();
  setupSuccessfulValidation();
});

// ============================================================================
// Guard / validation branches (I-1 ~ I-6)
// ============================================================================

describe('submitInboundRequestAction - 인증/검증 분기', () => {
  it('I-1: 미인증 사용자는 로그인 안내를 반환하고 RPC를 호출하지 않는다', async () => {
    setUnauthenticated();

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '제목', excel: defaultExcelFile() }),
    );

    expect(result).toEqual({ ok: false, error: '로그인이 필요합니다.' });
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('I-2: 제목이 비어있으면 스키마 검증 실패로 ok:false를 반환한다', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '', body: '내용', excel: defaultExcelFile() }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.callRpc).not.toHaveBeenCalled();
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });

  it('I-3: validateExcelUpload 실패 결과를 그대로 반환한다', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    mocks.validateExcelUpload.mockResolvedValue({
      ok: false,
      error: '엑셀 파일을 첨부해주세요.',
    });

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '제목', body: '내용' }),
    );

    expect(result).toEqual({ ok: false, error: '엑셀 파일을 첨부해주세요.' });
    expect(mocks.parseInboundInventoryExcel).not.toHaveBeenCalled();
  });

  it('I-4: parseInboundInventoryExcel가 throw하면 메시지를 그대로 전달한다', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    mocks.parseInboundInventoryExcel.mockRejectedValue(new Error('엑셀 시트가 비어있습니다.'));

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '제목', body: '내용', excel: defaultExcelFile() }),
    );

    expect(result).toEqual({ ok: false, error: '엑셀 시트가 비어있습니다.' });
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });

  it('I-5: 이미지 크기가 5MB를 초과하면 ok:false를 반환한다', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    const bigImage = makeFile('huge.jpg', 5 * 1024 * 1024 + 1, 'image/jpeg');

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [bigImage],
      }),
    );

    expect(result.ok).toBe(false);
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });

  it('I-6: 허용되지 않은 이미지 확장자(.gif)는 ok:false를 반환한다', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    const gifImage = makeFile('image.gif', 1024, 'image/gif');

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [gifImage],
      }),
    );

    expect(result.ok).toBe(false);
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Storage / RPC failure with cleanup (I-7 ~ I-9)
// ============================================================================

describe('submitInboundRequestAction - storage/RPC 실패 + cleanup', () => {
  it('I-7: 엑셀 storage 업로드 실패 시 에러 메시지를 반환한다', async () => {
    const upload = vi.fn().mockResolvedValueOnce({ error: { message: 'permission denied' } });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, remove } });
    setSignedIn(sb.client);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '제목', body: '내용', excel: defaultExcelFile() }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/엑셀 업로드 실패/);
    }
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('I-8: 첫 번째 이미지 업로드 실패 시 cleanup(remove)을 호출하고 에러를 반환한다', async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ error: null }) // excel ok
      .mockResolvedValueOnce({ error: { message: 'image fail' } }); // image fail
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, remove } });
    setSignedIn(sb.client);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [makeFile('a.jpg', 1024, 'image/jpeg')],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/이미지 업로드 실패/);
    }
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('I-9: RPC가 실패하면 cleanup(remove)을 호출하고 매핑된 에러를 반환한다', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({
      data: null,
      error: { message: 'RATE_LIMITED' },
    });

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '제목', body: '내용', excel: defaultExcelFile() }),
    );

    expect(result).toEqual({
      ok: false,
      error: '잠시 후 다시 시도해주세요 (분당 5건 제한).',
    });
    expect(sb.storage.remove).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Rename → DB update → rollback → chase-update 4-fold branches (I-10 ~ I-13)
// ============================================================================

describe('submitInboundRequestAction - rename/rollback 4겹 분기', () => {
  it('I-10 (Case B): rename 전체 성공 + DB update 성공 → canonical 경로 유지, ok:true', async () => {
    const move = vi.fn().mockResolvedValue({ error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, move, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [makeFile('a.jpg', 1024, 'image/jpeg')],
      }),
    );

    expect(result).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(updateChain.update).toHaveBeenCalledTimes(1);
    const updateArg = updateChain.update.mock.calls[0][0];
    expect(updateArg.excel_storage_path).toContain(REQUEST_ID);
    expect(updateArg.image_paths[0]).toContain(REQUEST_ID);
    expect(mocks.revalidatePaths).toHaveBeenCalled();
  });

  it('I-11 (Case A): rename 전체 실패(excel+images 모두 move 실패) → DB update 호출되지 않고 ok:true', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const move = vi.fn().mockResolvedValue({ error: { message: 'move failed' } });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, move, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [makeFile('a.jpg', 1024, 'image/jpeg')],
      }),
    );

    expect(result).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(updateChain.update).not.toHaveBeenCalled();
    expect(mocks.mutationTable).not.toHaveBeenCalled();
  });

  it('I-12 (Case C): rename 성공 + DB update 실패 → rollback 전체 성공 → chase-update 미호출', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const move = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, move, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValueOnce({ error: { message: 'db update failed' } }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [makeFile('a.jpg', 1024, 'image/jpeg')],
      }),
    );

    expect(result).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(updateChain.update).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledTimes(4);
  });

  it('I-13 (Case E): rename 성공 + DB update 실패 + rollback 일부 실패 → chase-update 호출됨', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });

    let callIdx = 0;
    const move = vi.fn().mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 3) return { error: { message: 'rollback fail' } };
      return { error: null };
    });
    const sb = buildSupabase({ storage: { upload, move, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi
        .fn()
        .mockResolvedValueOnce({ error: { message: 'db update failed' } })
        .mockResolvedValueOnce({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [makeFile('a.jpg', 1024, 'image/jpeg')],
      }),
    );

    expect(result).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(updateChain.update).toHaveBeenCalledTimes(2);
    const chaseArg = updateChain.update.mock.calls[1][0];
    expect(chaseArg.excel_storage_path).toContain(REQUEST_ID);
  });

  it('I-16 (Case F): chase-update까지 실패해도 액션은 ok:true 반환 (orphan 가능, console.error 경고)', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });

    // rollback excel move(3번째 호출) 실패 → chase-update 트리거
    let callIdx = 0;
    const move = vi.fn().mockImplementation(async () => {
      callIdx += 1;
      if (callIdx === 3) return { error: { message: 'rollback fail' } };
      return { error: null };
    });
    const sb = buildSupabase({ storage: { upload, move, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    // 첫 update(DB) 실패 + chase-update(두 번째)도 실패 → orphan 가능
    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi
        .fn()
        .mockResolvedValueOnce({ error: { message: 'db update failed' } })
        .mockResolvedValueOnce({ error: { message: 'chase-update failed' } }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [makeFile('a.jpg', 1024, 'image/jpeg')],
      }),
    );

    // ★ 현재 계약: chase-update까지 실패해 orphan 파일이 남더라도
    //   사용자에게는 성공(ok:true)으로 보고하고 console.error 경고만 남긴다.
    //   이 동작은 분할 전 원본과 동일하며, 향후 변경 시 이 계약을 의식적으로 다뤄야 한다.
    expect(result).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(updateChain.update).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('chase-update also failed'),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });
});

// ============================================================================
// Happy path edge cases (I-14 ~ I-15)
// ============================================================================

describe('submitInboundRequestAction - happy path edge cases', () => {
  it('I-15: 이미지 0장(엑셀만) 정상 처리 → ok:true', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({ title: '제목', body: '내용', excel: defaultExcelFile() }),
    );

    expect(result).toEqual({ ok: true, requestId: REQUEST_ID });
    expect(mocks.revalidatePaths).toHaveBeenCalled();
  });

  it('I-14: 이미지 3장 최대치 정상 처리 → 모든 이미지에 대해 upload 호출', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(updateChain);

    const result = await submitInboundRequestAction(
      null,
      buildFormData({
        title: '제목',
        body: '내용',
        excel: defaultExcelFile(),
        images: [
          makeFile('a.jpg', 1024, 'image/jpeg'),
          makeFile('b.png', 1024, 'image/png'),
          makeFile('c.webp', 1024, 'image/webp'),
        ],
      }),
    );

    expect(result.ok).toBe(true);
    expect(upload).toHaveBeenCalledTimes(4);
  });
});
