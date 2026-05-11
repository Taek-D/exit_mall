import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseProductImportExcel,
  PRODUCT_IMPORT_HEADERS,
  normalizeImportKey,
} from '@/lib/product-import-parser';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

type WorkbookRow = [
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
  unknown,
];

async function workbookBuffer({
  headers = PRODUCT_IMPORT_HEADERS,
  rows = [],
  images = [],
}: {
  headers?: readonly string[];
  rows?: WorkbookRow[];
  images?: Array<{ rowNumber: number; width?: number; height?: number }>;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('59 배포');
  ws.addRow([...headers]);
  ws.addRows(rows);

  for (const image of images) {
    const imageId = wb.addImage({ buffer: PNG_1X1 as any, extension: 'png' });
    ws.addImage(imageId, {
      tl: { col: 0, row: image.rowNumber - 1 },
      ext: { width: image.width ?? 20, height: image.height ?? 20 },
      editAs: 'oneCell',
    } as any);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}

describe('parseProductImportExcel', () => {
  it('parses valid product rows and maps row images', async () => {
    const parsed = await parseProductImportExcel(
      await workbookBuffer({
        rows: [
          ['', '세포랩', '바이오제닉 에센스', '155ml', 43000, 'PRD-0004', '화장품', '880000000004', ''],
          ['', '세포랩', '바이오제닉 에센스', '100ml', '24,400', 'PRD-0005', '화장품', '880000000005', '비고'],
        ],
        images: [{ rowNumber: 2 }],
      }),
    );

    expect(parsed.sheetName).toBe('59 배포');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      rowNumber: 2,
      brand: '세포랩',
      productName: '바이오제닉 에센스',
      optionName: '155ml',
      displayName: '바이오제닉 에센스 / 155ml',
      importKey: normalizeImportKey('바이오제닉 에센스 / 155ml'),
      price: 43000,
      managementCode: 'PRD-0004',
      category: '화장품',
      barcode: '880000000004',
      hasImage: true,
      errors: [],
    });
    expect(parsed.rows[0]!.image?.buffer.length).toBeGreaterThan(0);
    expect(parsed.rows[1]!.price).toBe(24400);
    expect(parsed.rows[1]!.warnings).toContain('제품 이미지가 없습니다.');
  });

  it('rejects missing headers', async () => {
    const headers = [...PRODUCT_IMPORT_HEADERS] as string[];
    headers[4] = '판매가';

    await expect(parseProductImportExcel(await workbookBuffer({ headers }))).rejects.toThrow(
      /헤더가 올바르지 않습니다/,
    );
  });

  it('rejects an empty workbook after the header', async () => {
    await expect(parseProductImportExcel(await workbookBuffer({ rows: [] }))).rejects.toThrow(
      /등록할 상품 행이 없습니다/,
    );
  });

  it('collects invalid price and duplicate display name as row errors', async () => {
    const parsed = await parseProductImportExcel(
      await workbookBuffer({
        rows: [
          ['', '브랜드', '상품', '단일', 'abc', 'A', '잡화', 'B1', ''],
          ['', '브랜드', '상품', '단일', 1000, 'B', '잡화', 'B2', ''],
        ],
      }),
    );

    expect(parsed.rows[0]!.errors).toEqual(
      expect.arrayContaining([
        '고객 판매가는 0 이상의 정수여야 합니다.',
        '상품명 / 옵션 조합이 중복됩니다: 2, 3행',
      ]),
    );
    expect(parsed.rows[1]!.errors).toContain('상품명 / 옵션 조합이 중복됩니다: 2, 3행');
  });

  it('warns on duplicate management codes and barcodes without failing rows', async () => {
    const parsed = await parseProductImportExcel(
      await workbookBuffer({
        rows: [
          ['', '브랜드', '상품 A', '단일', 1000, 'PRD-1', '잡화', 'BAR-1', ''],
          ['', '브랜드', '상품 B', '단일', 2000, 'PRD-1', '잡화', 'BAR-1', ''],
        ],
      }),
    );

    expect(parsed.rows.every((row) => row.errors.length === 0)).toBe(true);
    expect(parsed.rows[0]!.warnings).toEqual(
      expect.arrayContaining(['관리코드 중복: PRD-1', '바코드 중복: BAR-1']),
    );
  });

  it('keeps the largest A-column image when multiple images are anchored to one row', async () => {
    const parsed = await parseProductImportExcel(
      await workbookBuffer({
        rows: [['', '브랜드', '상품', '단일', 1000, 'PRD-1', '잡화', 'BAR-1', '']],
        images: [
          { rowNumber: 2, width: 10, height: 10 },
          { rowNumber: 2, width: 40, height: 40 },
        ],
      }),
    );

    expect(parsed.rows[0]!.image?.width).toBe(40);
    expect(parsed.rows[0]!.image?.height).toBe(40);
  });
});
