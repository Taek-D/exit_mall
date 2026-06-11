import { randomBytes } from 'crypto';
import type { SignedInContext } from '@/lib/actions/_guards';
import { callRpc, mutationTable } from '@/lib/actions/_shared';
import { safeStorageName, validateExcelUpload } from '@/lib/files/excel';
import { safeFilename } from '@/lib/inbound/storage';
import {
  parseInboundInventoryExcel,
  type ParsedInboundInventoryItem,
} from '@/lib/purchased-shipping';
import { mapSubmitInboundRequestError } from '@/lib/inbound/action-errors';
import {
  applyInboundMoveOutcomes,
  chaseInboundPathsAfterRollback,
  inboundCleanupPaths,
  type InboundMoveOutcome,
} from '@/lib/inbound/upload-paths';

const MAX_EXCEL_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function nanoid(): string {
  return randomBytes(8).toString('hex');
}

function lower(s: string) {
  return s.toLowerCase();
}

type PreparedInboundUploads =
  | {
      ok: true;
      excelFile: File;
      excelPath: string;
      imagePaths: string[];
      inboundItems: ParsedInboundInventoryItem[];
    }
  | { ok: false; error: string };

export async function prepareInboundUploads(
  supabase: SignedInContext['supabase'],
  userId: string,
  fd: FormData,
): Promise<PreparedInboundUploads> {
  const excelUpload = await validateExcelUpload(fd.get('excel'), {
    maxBytes: MAX_EXCEL_BYTES,
    sizeLabel: '5MB',
    emptyMessage: '엑셀 파일을 첨부해주세요.',
    sizeMessage: '엑셀은 5MB 이하여야 합니다.',
    extensionMessage: '.xlsx 만 첨부할 수 있습니다.',
    invalidTypeMessage: '엑셀(.xlsx) 형식이 아닙니다.',
  });
  if (!excelUpload.ok) return excelUpload;
  const { file: excelFile, buffer: excelBuf } = excelUpload;

  let inboundItems: ParsedInboundInventoryItem[];
  try {
    inboundItems = await parseInboundInventoryExcel(excelBuf);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '입고리스트 엑셀을 읽을 수 없습니다.',
    };
  }

  const imageFiles: File[] = [];
  for (let i = 0; i < MAX_IMAGES; i++) {
    const f = fd.get(`image${i}`);
    if (f instanceof File && f.size > 0) imageFiles.push(f);
  }
  if (imageFiles.length > MAX_IMAGES) {
    return { ok: false, error: `이미지는 최대 ${MAX_IMAGES}장까지 첨부할 수 있습니다.` };
  }
  for (const img of imageFiles) {
    if (img.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: '이미지는 장당 5MB 이하여야 합니다.' };
    }
    if (!ALLOWED_IMAGE_EXT.some((ext) => lower(img.name).endsWith(ext))) {
      return { ok: false, error: '이미지는 jpg/png/webp 만 가능합니다.' };
    }
  }

  const tmp = `_pending_${nanoid()}`;
  const excelPath = `${userId}/${tmp}/excel/${safeStorageName(excelFile.name, { allowKorean: true })}`;
  const { error: exUpErr } = await supabase.storage
    .from('inbound-requests')
    .upload(excelPath, excelBuf, {
      contentType:
        excelFile.type ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    });
  if (exUpErr) return { ok: false, error: `엑셀 업로드 실패: ${exUpErr.message}` };

  const imagePaths: string[] = [];
  for (const img of imageFiles) {
    const imgPath = `${userId}/${tmp}/images/${nanoid()}-${safeFilename(img.name)}`;
    const buf = Buffer.from(await img.arrayBuffer());
    const { error: imgErr } = await supabase.storage
      .from('inbound-requests')
      .upload(imgPath, buf, { contentType: img.type || 'image/jpeg', upsert: false });
    if (imgErr) {
      await supabase.storage
        .from('inbound-requests')
        .remove(inboundCleanupPaths(excelPath, imagePaths));
      return { ok: false, error: `이미지 업로드 실패: ${imgErr.message}` };
    }
    imagePaths.push(imgPath);
  }

  return { ok: true, excelFile, excelPath, imagePaths, inboundItems };
}

export async function submitInboundRequestRpc(
  supabase: SignedInContext['supabase'],
  input: { title: string; body: string },
  excelPath: string,
  excelName: string,
  imagePaths: string[],
  inboundItems: ParsedInboundInventoryItem[],
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const { data: newId, error: rpcErr } = await callRpc(
    supabase,
    'submit_inbound_request_rpc',
    {
      p_title: input.title,
      p_body: input.body,
      p_excel_path: excelPath,
      p_excel_name: excelName,
      p_image_paths: imagePaths,
      p_items: inboundItems,
    },
  );
  if (rpcErr || !newId) {
    const mapped = mapSubmitInboundRequestError(rpcErr?.message ?? '', MAX_IMAGES);
    if (mapped) return { ok: false, error: mapped };
    console.error('[inbound] submit_inbound_request_rpc', rpcErr);
    return { ok: false, error: `저장 실패: ${rpcErr?.message ?? 'unknown'}` };
  }
  return { ok: true, requestId: newId as string };
}

export async function renameInboundUploadsToCanonical(
  supabase: SignedInContext['supabase'],
  userId: string,
  requestId: string,
  excelName: string,
  originalExcelPath: string,
  originalImagePaths: string[],
): Promise<void> {
  const renamedExcel = `${userId}/${requestId}/excel/${safeStorageName(excelName, { allowKorean: true })}`;
  const { error: mvExcelErr } = await supabase.storage
    .from('inbound-requests')
    .move(originalExcelPath, renamedExcel);

  const imageMoves: InboundMoveOutcome[] = [];
  for (let i = 0; i < originalImagePaths.length; i++) {
    const old = originalImagePaths[i];
    const baseName = old.split('/').pop();
    if (!baseName) continue;
    const newName = `${userId}/${requestId}/images/${baseName}`;
    const { error } = await supabase.storage.from('inbound-requests').move(old, newName);
    imageMoves.push({ ok: !error, from: old, to: newName });
  }

  const { finalExcelPath, finalImagePaths, renameHappened } = applyInboundMoveOutcomes({
    originalExcelPath,
    originalImagePaths,
    excelMove: { ok: !mvExcelErr, from: originalExcelPath, to: renamedExcel },
    imageMoves,
  });

  if (!renameHappened) return;

  const { error: upErr } = await mutationTable(supabase, 'inbound_requests')
    .update({ excel_storage_path: finalExcelPath, image_paths: finalImagePaths })
    .eq('id', requestId);

  if (!upErr) return;

  console.error('[inbound] post-rename DB update failed; rolling back rename', upErr);
  const rollbackResults: InboundMoveOutcome[] = [];
  if (finalExcelPath !== originalExcelPath) {
    const { error } = await supabase.storage
      .from('inbound-requests')
      .move(finalExcelPath, originalExcelPath);
    rollbackResults.push({ ok: !error, from: finalExcelPath, to: originalExcelPath });
    if (error) console.error('[inbound] excel rename rollback failed', error);
  }
  for (let i = 0; i < finalImagePaths.length; i++) {
    if (finalImagePaths[i] !== originalImagePaths[i]) {
      const { error } = await supabase.storage
        .from('inbound-requests')
        .move(finalImagePaths[i], originalImagePaths[i]);
      rollbackResults.push({ ok: !error, from: finalImagePaths[i], to: originalImagePaths[i] });
      if (error) console.error('[inbound] image rename rollback failed', error);
    }
  }

  if (rollbackResults.some((r) => !r.ok)) {
    const { excelPath: chaseExcel, imagePaths: chaseImages } =
      chaseInboundPathsAfterRollback({
        originalExcelPath,
        originalImagePaths,
        finalExcelPath,
        finalImagePaths,
        rollbackResults,
      });
    const { error: chaseErr } = await mutationTable(supabase, 'inbound_requests')
      .update({ excel_storage_path: chaseExcel, image_paths: chaseImages })
      .eq('id', requestId);
    if (chaseErr)
      console.error('[inbound] chase-update also failed; orphan possible', chaseErr);
  }
}
