export type InboundMoveOutcome = {
  from: string;
  to: string;
  ok: boolean;
};

export function inboundCleanupPaths(excelPath: string, imagePaths: string[]): string[] {
  return [excelPath, ...imagePaths].filter(Boolean);
}

export function applyInboundMoveOutcomes({
  originalExcelPath,
  originalImagePaths,
  excelMove,
  imageMoves,
}: {
  originalExcelPath: string;
  originalImagePaths: string[];
  excelMove: InboundMoveOutcome;
  imageMoves: InboundMoveOutcome[];
}) {
  const finalExcelPath = excelMove.ok ? excelMove.to : originalExcelPath;
  const finalImagePaths = originalImagePaths.map((original, index) => {
    const move = imageMoves[index];
    return move?.ok ? move.to : original;
  });

  return {
    finalExcelPath,
    finalImagePaths,
    renameHappened:
      finalExcelPath !== originalExcelPath ||
      finalImagePaths.some((path, index) => path !== originalImagePaths[index]),
  };
}

export function chaseInboundPathsAfterRollback({
  originalExcelPath,
  originalImagePaths,
  finalExcelPath,
  finalImagePaths,
  rollbackResults,
}: {
  originalExcelPath: string;
  originalImagePaths: string[];
  finalExcelPath: string;
  finalImagePaths: string[];
  rollbackResults: InboundMoveOutcome[];
}) {
  const excelRollbackFailed = rollbackResults.some(
    (result) => !result.ok && result.from === finalExcelPath,
  );

  return {
    excelPath: excelRollbackFailed ? finalExcelPath : originalExcelPath,
    imagePaths: finalImagePaths.map((path, index) => {
      const failed = rollbackResults.some((result) => !result.ok && result.from === path);
      return failed ? path : originalImagePaths[index];
    }),
  };
}
