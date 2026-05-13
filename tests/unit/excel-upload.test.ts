import { describe, expect, it } from 'vitest';
import {
  fileToBuffer,
  safeStorageName,
  validateExcelUpload,
} from '@/lib/files/excel';

const XLSX_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function file(name: string, bytes: Uint8Array): File {
  return new File([Buffer.from(bytes)], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('validateExcelUpload', () => {
  it('rejects missing or empty files', async () => {
    await expect(validateExcelUpload(null, { maxBytes: 10 })).resolves.toMatchObject({
      ok: false,
      error: '파일을 선택해주세요.',
    });

    await expect(validateExcelUpload(file('empty.xlsx', new Uint8Array()), { maxBytes: 10 }))
      .resolves.toMatchObject({
        ok: false,
        error: '파일을 선택해주세요.',
      });
  });

  it('rejects files over the configured size', async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]);

    await expect(validateExcelUpload(file('big.xlsx', bytes), { maxBytes: 4 }))
      .resolves.toMatchObject({
        ok: false,
        error: '파일 크기는 4B 이하여야 합니다.',
      });
  });

  it('rejects non-xlsx extensions', async () => {
    await expect(validateExcelUpload(file('orders.xls', XLSX_MAGIC), { maxBytes: 10 }))
      .resolves.toMatchObject({
        ok: false,
        error: '.xlsx 파일만 업로드할 수 있습니다.',
      });
  });

  it('rejects files without the OOXML zip magic number', async () => {
    await expect(validateExcelUpload(file('orders.xlsx', new Uint8Array([1, 2, 3, 4])), {
      maxBytes: 10,
    })).resolves.toMatchObject({
      ok: false,
      error: '엑셀(.xlsx) 파일 형식이 아닙니다.',
    });
  });

  it('returns the file and buffer for valid xlsx-looking uploads', async () => {
    const result = await validateExcelUpload(file('orders.xlsx', XLSX_MAGIC), { maxBytes: 10 });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.name).toBe('orders.xlsx');
      expect(result.buffer).toEqual(Buffer.from(XLSX_MAGIC));
    }
  });
});

describe('fileToBuffer', () => {
  it('converts a File into a Buffer', async () => {
    await expect(fileToBuffer(file('orders.xlsx', XLSX_MAGIC))).resolves.toEqual(
      Buffer.from(XLSX_MAGIC),
    );
  });
});

describe('safeStorageName', () => {
  it('normalizes unsafe characters', () => {
    expect(safeStorageName('a/b c.xlsx')).toBe('a_b_c.xlsx');
  });

  it('preserves Korean characters when requested', () => {
    expect(safeStorageName('입고 리스트.xlsx', { allowKorean: true })).toBe('입고_리스트.xlsx');
  });

  it('falls back when the sanitized name is empty', () => {
    expect(safeStorageName('***')).toBe('upload.xlsx');
  });
});
