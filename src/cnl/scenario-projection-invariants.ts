import { isFiniteNumber } from './validate-spec-shared.js';

export interface ScenarioProjectionEntry {
  readonly source: 'initialPlacements' | 'outOfPlay';
  readonly pieceTypeId: string | undefined;
  readonly faction: string | undefined;
  readonly count: number | undefined;
  readonly pieceTypePath: string;
  readonly factionPath: string;
}

export interface ScenarioProjectionInvariantIssues {
  readonly unknownPieceType: ReadonlyArray<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly pieceTypePath: string;
  }>;
  readonly factionMismatch: ReadonlyArray<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly actualFaction: string;
    readonly expectedFaction: string;
    readonly factionPath: string;
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
  readonly factionMismatch: {
    readonly initialPlacementsCode: string;
    readonly outOfPlayCode: string;
    readonly message: (actualFaction: string, pieceTypeId: string, expectedFaction: string) => string;
    readonly suggestion: (expectedFaction: string) => string;
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
      faction: typeof record?.faction === 'string' ? record.faction : undefined,
      count: isFiniteNumber(record?.count) ? record.count : undefined,
      pieceTypePath: `${baseEntryPath}.pieceTypeId`,
      factionPath: `${baseEntryPath}.faction`,
    });
  }

  for (const [index, value] of (payload.outOfPlay ?? []).entries()) {
    const baseEntryPath = `${basePath}.outOfPlay.${index}`;
    const record = asRecord(value);
    entries.push({
      source: 'outOfPlay',
      pieceTypeId: typeof record?.pieceTypeId === 'string' ? record.pieceTypeId : undefined,
      faction: typeof record?.faction === 'string' ? record.faction : undefined,
      count: isFiniteNumber(record?.count) ? record.count : undefined,
      pieceTypePath: `${baseEntryPath}.pieceTypeId`,
      factionPath: `${baseEntryPath}.faction`,
    });
  }

  return entries;
}

export function evaluateScenarioProjectionInvariants(
  entries: readonly ScenarioProjectionEntry[],
  pieceTypeFactionById: ReadonlyMap<string, string>,
  inventoryTotalByPieceType: ReadonlyMap<string, number>,
): ScenarioProjectionInvariantIssues {
  const unknownPieceType: Array<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly pieceTypePath: string;
  }> = [];
  const factionMismatch: Array<{
    readonly source: 'initialPlacements' | 'outOfPlay';
    readonly pieceTypeId: string;
    readonly actualFaction: string;
    readonly expectedFaction: string;
    readonly factionPath: string;
  }> = [];
  const usedCounts = new Map<string, number>();

  for (const entry of entries) {
    if (entry.pieceTypeId !== undefined && pieceTypeFactionById.size > 0) {
      const expectedFaction = pieceTypeFactionById.get(entry.pieceTypeId);
      if (expectedFaction === undefined) {
        unknownPieceType.push({
          source: entry.source,
          pieceTypeId: entry.pieceTypeId,
          pieceTypePath: entry.pieceTypePath,
        });
      } else if (entry.faction !== undefined && entry.faction !== expectedFaction) {
        factionMismatch.push({
          source: entry.source,
          pieceTypeId: entry.pieceTypeId,
          actualFaction: entry.faction,
          expectedFaction,
          factionPath: entry.factionPath,
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
    factionMismatch,
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

  for (const issue of issues.factionMismatch) {
    diagnostics.push({
      code:
        issue.source === 'initialPlacements'
          ? dialect.factionMismatch.initialPlacementsCode
          : dialect.factionMismatch.outOfPlayCode,
      path: issue.factionPath,
      severity: 'error',
      message: dialect.factionMismatch.message(issue.actualFaction, issue.pieceTypeId, issue.expectedFaction),
      suggestion: dialect.factionMismatch.suggestion(issue.expectedFaction),
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
