/**
 * submitSupportRequestAction 안전망 테스트.
 *
 * 이 테스트는 lib/actions/support-request.ts (line 140-244, 105줄)의 거대 함수
 * 분할 직전에 현재 동작을 계약으로 고정한다.
 *
 * 특히 S-12 케이스(redirect + 클라이언트 router.push 이중 navigate)는
 * Phase 3 리팩토링에서 수정 예정이므로, 현재 동작(서버 redirect 호출 여부)을
 * 명시적으로 캡처한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSignedIn: vi.fn(),
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  fileToBuffer: vi.fn(),
  callRpc: vi.fn(),
  mutationTable: vi.fn(),
  revalidatePaths: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/actions/_guards', () => ({
  requireSignedIn: mocks.requireSignedIn,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock('@/lib/files/excel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/files/excel')>();
  return {
    ...actual,
    fileToBuffer: mocks.fileToBuffer,
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

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

import { submitSupportRequestAction } from '@/lib/actions/support-request';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

// JPEG magic bytes - used to pass isValidAttachmentBuffer for .jpg files
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

type StorageMethod = ReturnType<typeof vi.fn>;
interface StorageMethods {
  upload: StorageMethod;
  remove: StorageMethod;
}

function buildSupabase(opts: { storage?: Partial<StorageMethods> } = {}) {
  const storage: StorageMethods = {
    upload: vi.fn().mockResolvedValue({ error: null }),
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
  category?: string;
  title?: string;
  body?: string;
  referenceType?: string;
  referenceValue?: string;
  attachments?: File[];
} = {}): FormData {
  const fd = new FormData();
  fd.set('category', opts.category ?? 'cs');
  fd.set('title', opts.title ?? '문의 제목');
  fd.set('body', opts.body ?? '문의 내용');
  fd.set('referenceType', opts.referenceType ?? 'none');
  if (opts.referenceValue !== undefined) {
    fd.set('referenceValue', opts.referenceValue);
  }
  for (const att of opts.attachments ?? []) {
    fd.append('attachments', att);
  }
  return fd;
}

function makeJpegFile(name = 'attachment.jpg', size = 1024): File {
  const buf = new Uint8Array(size);
  buf.set(JPEG_HEADER, 0);
  return new File([buf], name, { type: 'image/jpeg' });
}

function makeGenericFile(name: string, size = 1024, type = 'application/octet-stream'): File {
  return new File([new Uint8Array(size)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  // 기본적으로 fileToBuffer는 JPEG magic bytes를 반환 → 첨부 검증 통과
  mocks.fileToBuffer.mockResolvedValue(JPEG_HEADER);
});

// ============================================================================
// Guard / validation branches (S-1 ~ S-6)
// ============================================================================

describe('submitSupportRequestAction - 인증/검증 분기', () => {
  it('S-1: 미인증 사용자는 로그인 안내를 반환한다', async () => {
    setUnauthenticated();

    const result = await submitSupportRequestAction(null, buildFormData());

    expect(result).toEqual({ ok: false, error: '로그인이 필요합니다.' });
    expect(mocks.callRpc).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('S-2: 카테고리가 잘못된 값이면 스키마 검증 실패', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);

    const result = await submitSupportRequestAction(
      null,
      buildFormData({ category: 'invalid-category' }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('S-3: 첨부파일 6개(MAX_ATTACHMENTS=5 초과) → ok:false', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);

    const attachments = Array.from({ length: 6 }, (_, i) => makeJpegFile(`a${i}.jpg`));
    const result = await submitSupportRequestAction(
      null,
      buildFormData({ attachments }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/최대 5개/);
    }
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('S-4: 첨부 크기 초과(>10MB) → ok:false', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    const bigFile = makeJpegFile('big.jpg', 10 * 1024 * 1024 + 1);

    const result = await submitSupportRequestAction(
      null,
      buildFormData({ attachments: [bigFile] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/파일당 10MB/);
    }
  });

  it('S-5: 허용되지 않은 확장자(.exe) → ok:false', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    const badFile = makeGenericFile('malware.exe', 1024);

    const result = await submitSupportRequestAction(
      null,
      buildFormData({ attachments: [badFile] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/형식만 가능/);
    }
  });

  it('S-6: magic bytes 불일치(.jpg 확장자에 빈 바이트) → ok:false', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    // fileToBuffer가 magic bytes가 아닌 빈 바이트를 반환하도록 override
    mocks.fileToBuffer.mockResolvedValueOnce(Buffer.from([0x00, 0x00, 0x00]));

    const result = await submitSupportRequestAction(
      null,
      buildFormData({ attachments: [makeJpegFile('fake.jpg')] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/내용이 일치하지 않습니다/);
    }
  });
});

// ============================================================================
// RPC failure + cleanup (S-7 ~ S-9)
// ============================================================================

describe('submitSupportRequestAction - RPC/첨부 실패 + cleanup', () => {
  it('S-7: RPC 실패(RATE_LIMITED) → ok:false (매퍼 적용)', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({
      data: null,
      error: { message: 'RATE_LIMITED' },
    });

    const result = await submitSupportRequestAction(null, buildFormData());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/잠시 후 다시/);
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('S-8: 첨부 storage 업로드 실패 → cleanup(remove) 호출 + ok:false', async () => {
    const upload = vi.fn().mockResolvedValueOnce({ error: { message: 'upload denied' } });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    mocks.mutationTable.mockReturnValue(deleteChain);

    const result = await submitSupportRequestAction(
      null,
      buildFormData({ attachments: [makeJpegFile('a.jpg')] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/첨부파일 업로드에 실패/);
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('S-9: 첨부 metadata insert 실패 → cleanup 호출 + ok:false', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload, remove } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const insertChain = {
      insert: vi.fn().mockResolvedValueOnce({ error: { message: 'metadata fail' } }),
    };
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ error: null }),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    let mutCallIdx = 0;
    mocks.mutationTable.mockImplementation(() => {
      mutCallIdx += 1;
      if (mutCallIdx === 1) return insertChain;
      return deleteChain;
    });

    const result = await submitSupportRequestAction(
      null,
      buildFormData({ attachments: [makeJpegFile('a.jpg')] }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/첨부파일 업로드에 실패/);
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Happy path + redirect contract (S-10, S-11)
// ============================================================================

describe('submitSupportRequestAction - 정상 경로 + redirect 계약', () => {
  it('S-10: 첨부 없는 정상 경로 → RPC 호출 + 상세로 서버 redirect', async () => {
    const sb = buildSupabase();
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    await submitSupportRequestAction(null, buildFormData());

    expect(mocks.callRpc).toHaveBeenCalledWith(
      sb.client,
      'submit_support_request_rpc',
      expect.objectContaining({
        p_category: 'cs',
        p_title: '문의 제목',
        p_body: '문의 내용',
        p_reference_type: 'none',
      }),
    );
    expect(mocks.revalidatePaths).toHaveBeenCalled();
    // 서버 redirect로 상세 페이지 이동(progressive enhancement). 클라이언트 중복 이동 없음.
    expect(mocks.redirect).toHaveBeenCalledWith(`/support-requests/${REQUEST_ID}`);
  });

  it('S-11: 첨부 있는 정상 경로 → storage upload + metadata insert + 서버 redirect', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const sb = buildSupabase({ storage: { upload } });
    setSignedIn(sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const insertChain = { insert: vi.fn().mockResolvedValue({ error: null }) };
    mocks.mutationTable.mockReturnValue(insertChain);

    await submitSupportRequestAction(
      null,
      buildFormData({ attachments: [makeJpegFile('a.jpg'), makeJpegFile('b.jpg')] }),
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(insertChain.insert).toHaveBeenCalledTimes(2);
    const firstInsertArg = insertChain.insert.mock.calls[0][0];
    expect(firstInsertArg.request_id).toBe(REQUEST_ID);
    expect(firstInsertArg.user_id).toBe(USER_ID);
    expect(mocks.redirect).toHaveBeenCalledWith(`/support-requests/${REQUEST_ID}`);
  });
});
