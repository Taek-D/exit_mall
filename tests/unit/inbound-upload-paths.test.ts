import { describe, expect, it } from 'vitest';
import {
  applyInboundMoveOutcomes,
  chaseInboundPathsAfterRollback,
  inboundCleanupPaths,
} from '@/lib/inbound/upload-paths';

describe('inboundCleanupPaths', () => {
  it('returns the excel path and already-uploaded image paths', () => {
    expect(inboundCleanupPaths('u/tmp/excel/a.xlsx', ['u/tmp/images/1.png'])).toEqual([
      'u/tmp/excel/a.xlsx',
      'u/tmp/images/1.png',
    ]);
  });
});

describe('applyInboundMoveOutcomes', () => {
  it('keeps the original excel path when the excel move fails', () => {
    const result = applyInboundMoveOutcomes({
      originalExcelPath: 'u/tmp/excel/a.xlsx',
      originalImagePaths: ['u/tmp/images/1.png'],
      excelMove: {
        from: 'u/tmp/excel/a.xlsx',
        to: 'u/request/excel/a.xlsx',
        ok: false,
      },
      imageMoves: [
        {
          from: 'u/tmp/images/1.png',
          to: 'u/request/images/1.png',
          ok: true,
        },
      ],
    });

    expect(result).toEqual({
      finalExcelPath: 'u/tmp/excel/a.xlsx',
      finalImagePaths: ['u/request/images/1.png'],
      renameHappened: true,
    });
  });

  it('reports no rename when every move fails', () => {
    const result = applyInboundMoveOutcomes({
      originalExcelPath: 'u/tmp/excel/a.xlsx',
      originalImagePaths: ['u/tmp/images/1.png'],
      excelMove: {
        from: 'u/tmp/excel/a.xlsx',
        to: 'u/request/excel/a.xlsx',
        ok: false,
      },
      imageMoves: [
        {
          from: 'u/tmp/images/1.png',
          to: 'u/request/images/1.png',
          ok: false,
        },
      ],
    });

    expect(result.renameHappened).toBe(false);
    expect(result.finalExcelPath).toBe('u/tmp/excel/a.xlsx');
    expect(result.finalImagePaths).toEqual(['u/tmp/images/1.png']);
  });
});

describe('chaseInboundPathsAfterRollback', () => {
  it('points DB paths to where files remain after partial rollback failure', () => {
    const result = chaseInboundPathsAfterRollback({
      originalExcelPath: 'u/tmp/excel/a.xlsx',
      originalImagePaths: ['u/tmp/images/1.png', 'u/tmp/images/2.png'],
      finalExcelPath: 'u/request/excel/a.xlsx',
      finalImagePaths: ['u/request/images/1.png', 'u/request/images/2.png'],
      rollbackResults: [
        {
          from: 'u/request/excel/a.xlsx',
          to: 'u/tmp/excel/a.xlsx',
          ok: false,
        },
        {
          from: 'u/request/images/1.png',
          to: 'u/tmp/images/1.png',
          ok: true,
        },
        {
          from: 'u/request/images/2.png',
          to: 'u/tmp/images/2.png',
          ok: false,
        },
      ],
    });

    expect(result).toEqual({
      excelPath: 'u/request/excel/a.xlsx',
      imagePaths: ['u/tmp/images/1.png', 'u/request/images/2.png'],
    });
  });
});
