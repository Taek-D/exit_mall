import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireSignedIn: vi.fn(),
  createClient: vi.fn(),
  fileToBuffer: vi.fn(),
  callRpc: vi.fn(),
  mutationTable: vi.fn(),
  revalidatePaths: vi.fn(),
}));

vi.mock('@/lib/actions/_guards', () => ({
  requireSignedIn: mocks.requireSignedIn,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
  createServiceRoleClient: vi.fn(),
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

import {
  addSupportCommentAction,
  deleteSupportCommentAction,
  updateSupportCommentAction,
} from '@/lib/actions/support-request';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const COMMENT_ID = '33333333-3333-4333-8333-333333333333';
const IMAGE_ID = '44444444-4444-4444-8444-444444444444';
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function makeCurrentImage(path = `${USER_ID}/${REQUEST_ID}/comments/${COMMENT_ID}/old.jpg`) {
  return {
    id: IMAGE_ID,
    comment_id: COMMENT_ID,
    request_id: REQUEST_ID,
    user_id: USER_ID,
    storage_path: path,
    original_name: 'old.jpg',
    content_type: 'image/jpeg',
    size_bytes: 1024,
  };
}

function makeJpegFile(name = 'reply.jpg', size = 1024): File {
  const buf = new Uint8Array(size);
  buf.set(JPEG_HEADER, 0);
  return new File([buf], name, { type: 'image/jpeg' });
}

function makeFormData(opts: {
  body?: string;
  image?: File;
  removeImage?: boolean;
} = {}): FormData {
  const fd = new FormData();
  fd.set('body', opts.body ?? 'reply body');
  if (opts.image) fd.set('image', opts.image);
  if (opts.removeImage) fd.set('removeImage', '1');
  return fd;
}

function buildSupabase(opts: {
  uploadError?: unknown;
  removeError?: unknown;
  commentRow?: {
    author_id: string;
    author_role: 'admin' | 'user';
    created_at: string;
    request_id: string;
  } | null;
  currentImage?: ReturnType<typeof makeCurrentImage> | null;
  imageRows?: { storage_path: string }[];
} = {}) {
  const storage = {
    upload: vi.fn().mockResolvedValue({ error: opts.uploadError ?? null }),
    remove: vi.fn().mockResolvedValue({ error: opts.removeError ?? null }),
  };
  const commentRow =
    opts.commentRow ?? {
      author_id: USER_ID,
      author_role: 'admin',
      created_at: new Date().toISOString(),
      request_id: REQUEST_ID,
    };
  const currentImage = opts.currentImage ?? null;
  const imageRows = opts.imageRows ?? [];

  const client = {
    storage: {
      from: vi.fn(() => storage),
    },
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string) => ({
        eq: vi.fn(() => {
          if (table === 'support_request_comments') {
            return {
              maybeSingle: vi.fn().mockResolvedValue({ data: commentRow, error: null }),
            };
          }
          if (table === 'support_requests') {
            return {
              maybeSingle: vi.fn().mockResolvedValue({
                data: { status: 'open' },
                error: null,
              }),
            };
          }
          if (table === 'support_request_comment_images' && columns.includes('id')) {
            return {
              maybeSingle: vi.fn().mockResolvedValue({ data: currentImage, error: null }),
            };
          }
          return { data: imageRows, error: null };
        }),
      })),
    })),
  };

  return { client, storage };
}

function signInAs(role: 'admin' | 'user', client: ReturnType<typeof buildSupabase>['client']) {
  mocks.requireSignedIn.mockResolvedValue({
    ok: true,
    supabase: client,
    user: { id: USER_ID },
    profile: { role, status: 'active' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fileToBuffer.mockResolvedValue(JPEG_HEADER);
  mocks.callRpc.mockResolvedValue({ data: COMMENT_ID, error: null });
  mocks.mutationTable.mockImplementation((_, table: string) => {
    if (table === 'support_request_comment_images') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }
    return {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
  });
});

describe('support comment image actions', () => {
  it('lets an admin create an image-only comment', async () => {
    const sb = buildSupabase();
    signInAs('admin', sb.client);

    const result = await addSupportCommentAction(
      REQUEST_ID,
      makeFormData({ body: '', image: makeJpegFile() }),
    );

    expect(result).toEqual({ ok: true, id: COMMENT_ID });
    expect(mocks.callRpc).toHaveBeenCalledWith(
      sb.client,
      'add_support_comment',
      expect.objectContaining({ p_body: '', p_has_image: true }),
    );
    expect(sb.storage.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects comment images from non-admin users', async () => {
    const sb = buildSupabase();
    signInAs('user', sb.client);

    const result = await addSupportCommentAction(
      REQUEST_ID,
      makeFormData({ image: makeJpegFile() }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.callRpc).not.toHaveBeenCalled();
  });

  it('rejects oversized, unsupported, and mismatched image files', async () => {
    const sb = buildSupabase();
    signInAs('admin', sb.client);

    expect(
      (
        await addSupportCommentAction(
          REQUEST_ID,
          makeFormData({ image: makeJpegFile('big.jpg', 5 * 1024 * 1024 + 1) }),
        )
      ).ok,
    ).toBe(false);

    expect(
      (
        await addSupportCommentAction(
          REQUEST_ID,
          makeFormData({ image: new File([new Uint8Array(10)], 'bad.gif') }),
        )
      ).ok,
    ).toBe(false);

    mocks.fileToBuffer.mockResolvedValueOnce(Buffer.from([0x00, 0x00]));
    expect(
      (
        await addSupportCommentAction(
          REQUEST_ID,
          makeFormData({ image: makeJpegFile('fake.jpg') }),
        )
      ).ok,
    ).toBe(false);
  });

  it('rolls back the comment when image upload fails', async () => {
    const sb = buildSupabase({ uploadError: { message: 'denied' } });
    signInAs('admin', sb.client);
    mocks.callRpc
      .mockResolvedValueOnce({ data: COMMENT_ID, error: null })
      .mockResolvedValueOnce({ data: REQUEST_ID, error: null });

    const result = await addSupportCommentAction(
      REQUEST_ID,
      makeFormData({ image: makeJpegFile() }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.callRpc).toHaveBeenLastCalledWith(sb.client, 'delete_support_comment', {
      p_comment_id: COMMENT_ID,
    });
  });

  it('cleans uploaded storage and rolls back the comment when image metadata insert fails', async () => {
    const sb = buildSupabase();
    signInAs('admin', sb.client);
    mocks.callRpc
      .mockResolvedValueOnce({ data: COMMENT_ID, error: null })
      .mockResolvedValueOnce({ data: REQUEST_ID, error: null });
    mocks.mutationTable.mockImplementation((_, table: string) => {
      if (table === 'support_request_comment_images') {
        return {
          insert: vi.fn().mockResolvedValue({ error: { message: 'metadata failed' } }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    const result = await addSupportCommentAction(
      REQUEST_ID,
      makeFormData({ image: makeJpegFile() }),
    );

    expect(result.ok).toBe(false);
    expect(sb.storage.remove).toHaveBeenCalledTimes(1);
    expect(mocks.callRpc).toHaveBeenLastCalledWith(sb.client, 'delete_support_comment', {
      p_comment_id: COMMENT_ID,
    });
  });

  it('lets an admin replace and remove a comment image during edit', async () => {
    const sb = buildSupabase({
      currentImage: makeCurrentImage(`${USER_ID}/${REQUEST_ID}/comments/old.jpg`),
    });
    signInAs('admin', sb.client);

    const replace = await updateSupportCommentAction(
      COMMENT_ID,
      makeFormData({ body: '', image: makeJpegFile('new.jpg') }),
    );
    expect(replace.ok).toBe(true);
    expect(sb.storage.upload).toHaveBeenCalledTimes(1);
    expect(sb.storage.remove).toHaveBeenCalledWith([`${USER_ID}/${REQUEST_ID}/comments/old.jpg`]);

    const remove = await updateSupportCommentAction(
      COMMENT_ID,
      makeFormData({ body: 'text remains', removeImage: true }),
    );
    expect(remove.ok).toBe(true);
  });

  it('rejects image edits on user-authored comments before upload', async () => {
    const sb = buildSupabase({
      commentRow: {
        author_id: '55555555-5555-4555-8555-555555555555',
        author_role: 'user',
        created_at: new Date().toISOString(),
        request_id: REQUEST_ID,
      },
    });
    signInAs('admin', sb.client);

    const result = await updateSupportCommentAction(
      COMMENT_ID,
      makeFormData({ body: 'admin edit', image: makeJpegFile('new.jpg') }),
    );

    expect(result.ok).toBe(false);
    expect(mocks.fileToBuffer).not.toHaveBeenCalled();
    expect(sb.storage.upload).not.toHaveBeenCalled();
  });

  it('restores previous image metadata when replacing an image but comment update fails', async () => {
    const currentImage = makeCurrentImage();
    const sb = buildSupabase({ currentImage });
    signInAs('admin', sb.client);
    const imageUpdates: unknown[] = [];
    mocks.mutationTable.mockImplementation((_, table: string) => {
      if (table === 'support_request_comment_images') {
        return {
          update: vi.fn((payload) => {
            imageUpdates.push(payload);
            return { eq: vi.fn().mockResolvedValue({ error: null }) };
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'body update failed' } }),
        }),
      };
    });

    const result = await updateSupportCommentAction(
      COMMENT_ID,
      makeFormData({ body: '', image: makeJpegFile('new.jpg') }),
    );

    expect(result.ok).toBe(false);
    expect(imageUpdates).toHaveLength(2);
    expect(imageUpdates[1]).toEqual(currentImage);
    expect(sb.storage.remove).toHaveBeenCalledTimes(1);
  });

  it('keeps the replacement file when previous image metadata restore fails', async () => {
    const currentImage = makeCurrentImage();
    const sb = buildSupabase({ currentImage });
    signInAs('admin', sb.client);
    let imageUpdateCount = 0;
    mocks.mutationTable.mockImplementation((_, table: string) => {
      if (table === 'support_request_comment_images') {
        return {
          update: vi.fn(() => {
            imageUpdateCount += 1;
            return {
              eq: vi.fn().mockResolvedValue({
                error: imageUpdateCount === 2 ? { message: 'restore failed' } : null,
              }),
            };
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'body update failed' } }),
        }),
      };
    });

    const result = await updateSupportCommentAction(
      COMMENT_ID,
      makeFormData({ body: '', image: makeJpegFile('new.jpg') }),
    );

    expect(result.ok).toBe(false);
    expect(imageUpdateCount).toBe(2);
    expect(sb.storage.remove).not.toHaveBeenCalled();
  });

  it('restores deleted image metadata when removing an image but comment update fails', async () => {
    const currentImage = makeCurrentImage();
    const sb = buildSupabase({ currentImage });
    signInAs('admin', sb.client);
    const imageInserts: unknown[] = [];
    mocks.mutationTable.mockImplementation((_, table: string) => {
      if (table === 'support_request_comment_images') {
        return {
          insert: vi.fn((payload) => {
            imageInserts.push(payload);
            return Promise.resolve({ error: null });
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'body update failed' } }),
        }),
      };
    });

    const result = await updateSupportCommentAction(
      COMMENT_ID,
      makeFormData({ body: 'text remains', removeImage: true }),
    );

    expect(result.ok).toBe(false);
    expect(imageInserts).toEqual([currentImage]);
    expect(sb.storage.remove).not.toHaveBeenCalledWith([currentImage.storage_path]);
  });

  it('cleans comment image storage after deleting a comment', async () => {
    const sb = buildSupabase({
      imageRows: [{ storage_path: `${USER_ID}/${REQUEST_ID}/comments/${COMMENT_ID}/image.jpg` }],
    });
    signInAs('admin', sb.client);
    mocks.callRpc.mockResolvedValue({ data: REQUEST_ID, error: null });

    const result = await deleteSupportCommentAction(COMMENT_ID);

    expect(result.ok).toBe(true);
    expect(sb.storage.remove).toHaveBeenCalledWith([
      `${USER_ID}/${REQUEST_ID}/comments/${COMMENT_ID}/image.jpg`,
    ]);
  });
});
