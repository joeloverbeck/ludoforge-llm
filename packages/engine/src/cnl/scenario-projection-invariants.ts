import { isFiniteNumber } from './validate-spec-shared.js';

export interface ScenarioProjectionEntry {
  readonly source: 'initialPlacements' | 'outOfPlay';
  readonly pieceTypeId: string | undefined;
  readonly seat: string | undefined;
  readonly count: number | undefined;
  readonly pieceTypePath: string;
  readonly seatPath: string;
}

export interface ScenarioProjectionInvariantIssues {
  readonly unknownPieceType: ReadonlyArray<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly pieceTypePath: string;
  }>;
  readonly seatMismatch: ReadonlyArray<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly actualSeat: string;
    readonly expectedSeat: string;
    readonly seatPath: string;
  }>;
  readonly conservationViolation: ReadonlyArray<{
    readonly pieceTypeId: string;
    readonly usedCount: number;
    readonly totalInventory: number;
  }>;
}

export interface ScenarioProjectionInvariantDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly severity: 'error';
  readonly message: string;
  readonly suggestion: string;
}

export interface ScenarioProjectionInvariantDiagnosticDialect {
  readonly unknownPieceType: {
    readonly initialPlacementsCode: string;
    readonly outOfPlayCode: string;
    readonly initialPlacementsMessage: (pieceTypeId: string) => string;
    readonly outOfPlayMessage: (pieceTypeId: string) => string;
    readonly suggestion: string;
  };
  readonly seatMismatch: {
    readonly initialPlacementsCode: string;
    readonly outOfPlayCode: string;
    readonly message: (actualSeat: string, pieceTypeId: string, expectedSeat: string) => string;
    readonly suggestion: (expectedSeat: string) => string;
  };
  readonly conservationViolation: {
    readonly code: string;
    readonly message: (pieceTypeId: string, usedCount: number, totalInventory: number) => string;
    readonly suggestion: (pieceTypeId: string, totalInventory: number) => string;
  };
}

export function collectScenarioProjectionEntries(
  payload: {
    readonly initialPlacements?: readonly unknown[];
    readonly outOfPlay?: readonly unknown[];
  },
  basePath: string,
): readonly ScenarioProjectionEntry[] {
  const entries: ScenarioProjectionEntry[] = [];

  for (const [index, value] of (payload.initialPlacements ?? []).entries()) {
    const baseEntryPath = `${basePath}.initialPlacements.${index}`;
    const record = asRecord(value);
    entries.push({
      source: 'initialPlacements',
      pieceTypeId: typeof record?.pieceTypeId === 'string' ? record.pieceTypeId : undefined,
      seat: typeof record?.seat === 'string' ? record.seat : undefined,
      count: isFiniteNumber(record?.count) ? record.count : undefined,
      pieceTypePath: `${baseEntryPath}.pieceTypeId`,
      seatPath: `${baseEntryPath}.seat`,
    });
  }

  for (const [index, value] of (payload.outOfPlay ?? []).entries()) {
    const baseEntryPath = `${basePath}.outOfPlay.${index}`;
    const record = asRecord(value);
    entries.push({
      source: 'outOfPlay',
      pieceTypeId: typeof record?.pieceTypeId === 'string' ? record.pieceTypeId : undefined,
      seat: typeof record?.seat === 'string' ? record.seat : undefined,
      count: isFiniteNumber(record?.count) ? record.count : undefined,
      pieceTypePath: `${baseEntryPath}.pieceTypeId`,
      seatPath: `${baseEntryPath}.seat`,
    });
  }

  return entries;
}

export function evaluateScenarioProjectionInvariants(
  entries: readonly ScenarioProjectionEntry[],
  pieceTypeSeatById: ReadonlyMap<string, string>,
  inventoryTotalByPieceType: ReadonlyMap<string, number>,
): ScenarioProjectionInvariantIssues {
  const unknownPieceType: Array<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly pieceTypePath: string;
  }> = [];
  const seatMismatch: Array<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly actualSeat: string;
    readonly expectedSeat: string;
    readonly seatPath: string;
  }> = [];
  const usedCounts = new Map<string, number>();

  for (const entry of entries) {
    if (entry.pieceTypeId !== undefined && pieceTypeSeatById.size > 0) {
      const expectedSeat = pieceTypeSeatById.get(entry.pieceTypeId);
      if (expectedSeat === undefined) {
        unknownPieceType.push({
          source: entry.source,
          pieceTypeId: entry.pieceTypeId,
          pieceTypePath: entry.pieceTypePath,
        });
      } else if (entry.seat !== undefined && entry.seat !== expectedSeat) {
        seatMismatch.push({
          source: entry.source,
          pieceTypeId: entry.pieceTypeId,
          actualSeat: entry.seat,
          expectedSeat,
          seatPath: entry.seatPath,
        });
      }
    }

    if (entry.pieceTypeId !== undefined && entry.count !== undefined) {
      usedCounts.set(entry.pieceTypeId, (usedCounts.get(entry.pieceTypeId) ?? 0) + entry.count);
    }
  }

  const conservationViolation: Array<{
    readonly pieceTypeId: string;
    readonly usedCount: number;
    readonly totalInventory: number;
  }> = [];
  for (const [pieceTypeId, usedCount] of usedCounts.entries()) {
    const totalInventory = inventoryTotalByPieceType.get(pieceTypeId);
    if (totalInventory !== undefined && usedCount > totalInventory) {
      conservationViolation.push({
        pieceTypeId,
        usedCount,
        totalInventory,
      });
    }
  }

  return {
    unknownPieceType,
    seatMismatch,
    conservationViolation,
  };
}

export function mapScenarioProjectionInvariantIssuesToDiagnostics(
  issues: ScenarioProjectionInvariantIssues,
  dialect: ScenarioProjectionInvariantDiagnosticDialect,
  options: {
    readonly conservationPath: string;
  },
): readonly ScenarioProjectionInvariantDiagnostic[] {
  const diagnostics: ScenarioProjectionInvariantDiagnostic[] = [];

  for (const issue of issues.unknownPieceType) {
    diagnostics.push({
      code:
        issue.source === 'initialPlacements'
          ? dialect.unknownPieceType.initialPlacementsCode
          : dialect.unknownPieceType.outOfPlayCode,
      path: issue.pieceTypePath,
      severity: 'error',
      message:
        issue.source === 'initialPlacements'
          ? dialect.unknownPieceType.initialPlacementsMessage(issue.pieceTypeId)
          : dialect.unknownPieceType.outOfPlayMessage(issue.pieceTypeId),
      suggestion: dialect.unknownPieceType.suggestion,
    });
  }

  for (const issue of issues.seatMismatch) {
    diagnostics.push({
      code:
        issue.source === 'initialPlacements'
          ? dialect.seatMismatch.initialPlacementsCode
          : dialect.seatMismatch.outOfPlayCode,
      path: issue.seatPath,
      severity: 'error',
      message: dialect.seatMismatch.message(issue.actualSeat, issue.pieceTypeId, issue.expectedSeat),
      suggestion: dialect.seatMismatch.suggestion(issue.expectedSeat),
    });
  }

  for (const issue of issues.conservationViolation) {
    diagnostics.push({
      code: dialect.conservationViolation.code,
      path: options.conservationPath,
      severity: 'error',
      message: dialect.conservationViolation.message(issue.pieceTypeId, issue.usedCount, issue.totalInventory),
      suggestion: dialect.conservationViolation.suggestion(issue.pieceTypeId, issue.totalInventory),
    });
  }

  return diagnostics;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
