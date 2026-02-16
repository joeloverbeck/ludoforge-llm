import type { GameDef, RuntimeTableContract } from './types.js';

type AssetRow = Readonly<Record<string, unknown>>;
type PredicateScalar = string | number | boolean;

export type RuntimeTableIssue =
  | { readonly kind: 'assetMissing'; readonly assetId: string }
  | { readonly kind: 'tablePathEmpty' }
  | { readonly kind: 'tablePathMissing'; readonly segment: string; readonly segmentIndex: number; readonly availableKeys: readonly string[] }
  | { readonly kind: 'tablePathTypeInvalid'; readonly segment: string; readonly segmentIndex: number; readonly actualType: string }
  | { readonly kind: 'tableTypeInvalid'; readonly actualType: string }
  | { readonly kind: 'rowTypeInvalid'; readonly rowIndex: number; readonly actualType: string };

export interface RuntimeTableIndexEntry {
  readonly contract: RuntimeTableContract;
  readonly rows: readonly AssetRow[] | null;
  readonly fieldNames: ReadonlySet<string>;
  readonly fieldContractsByName: ReadonlyMap<string, RuntimeTableContract['fields'][number]>;
  readonly keyIndexesByTuple: ReadonlyMap<string, RuntimeTableKeyIndex>;
  readonly issue?: RuntimeTableIssue;
}

export interface RuntimeTableIndex {
  readonly tableIds: readonly string[];
  readonly tablesById: ReadonlyMap<string, RuntimeTableIndexEntry>;
}

export interface RuntimeTableKeyIndex {
  readonly tuple: readonly [string, ...string[]];
  readonly rowsByCompositeKey: ReadonlyMap<string, readonly AssetRow[]>;
}

function tupleId(tuple: readonly [string, ...string[]]): string {
  return tuple.join('\u0001');
}

function encodeScalar(value: PredicateScalar): string {
  if (typeof value === 'string') {
    return `s:${value}`;
  }
  if (typeof value === 'number') {
    return `n:${value}`;
  }
  return `b:${value ? '1' : '0'}`;
}

function isPredicateScalar(value: unknown): value is PredicateScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function compositeKeyFromTuple(tuple: readonly [string, ...string[]], row: AssetRow): string | null {
  const parts: string[] = [];
  for (const field of tuple) {
    const value = row[field];
    if (!isPredicateScalar(value)) {
      return null;
    }
    parts.push(encodeScalar(value));
  }
  return parts.join('\u0002');
}

function buildKeyIndexes(
  contract: RuntimeTableContract,
  rows: readonly AssetRow[] | null,
): ReadonlyMap<string, RuntimeTableKeyIndex> {
  const keyIndexesByTuple = new Map<string, RuntimeTableKeyIndex>();
  if (rows === null) {
    return keyIndexesByTuple;
  }
  for (const tuple of contract.uniqueBy ?? []) {
    const rowsByCompositeKey = new Map<string, AssetRow[]>();
    for (const row of rows) {
      const compositeKey = compositeKeyFromTuple(tuple, row);
      if (compositeKey === null) {
        continue;
      }
      const existing = rowsByCompositeKey.get(compositeKey);
      if (existing === undefined) {
        rowsByCompositeKey.set(compositeKey, [row]);
        continue;
      }
      existing.push(row);
    }
    keyIndexesByTuple.set(tupleId(tuple), {
      tuple,
      rowsByCompositeKey,
    });
  }
  return keyIndexesByTuple;
}

function resolveRowsByTablePath(
  payload: unknown,
  tablePath: string,
): {
  readonly rows: readonly AssetRow[] | null;
  readonly issue?: RuntimeTableIssue;
} {
  const pathSegments = tablePath
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (pathSegments.length === 0) {
    return { rows: null, issue: { kind: 'tablePathEmpty' } };
  }

  let current: unknown = payload;
  for (const [segmentIndex, segment] of pathSegments.entries()) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      return {
        rows: null,
        issue: {
          kind: 'tablePathTypeInvalid',
          segment,
          segmentIndex,
          actualType: Array.isArray(current) ? 'array' : typeof current,
        },
      };
    }

    const next = (current as Record<string, unknown>)[segment];
    if (next === undefined) {
      return {
        rows: null,
        issue: {
          kind: 'tablePathMissing',
          segment,
          segmentIndex,
          availableKeys: Object.keys(current).sort((left, right) => left.localeCompare(right)),
        },
      };
    }
    current = next;
  }

  if (!Array.isArray(current)) {
    return {
      rows: null,
      issue: {
        kind: 'tableTypeInvalid',
        actualType: Array.isArray(current) ? 'array' : typeof current,
      },
    };
  }

  for (let rowIndex = 0; rowIndex < current.length; rowIndex += 1) {
    const row = current[rowIndex];
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      return {
        rows: null,
        issue: {
          kind: 'rowTypeInvalid',
          rowIndex,
          actualType: Array.isArray(row) ? 'array' : typeof row,
        },
      };
    }
  }

  return {
    rows: current as readonly AssetRow[],
  };
}

export function buildRuntimeTableIndex(def: GameDef): RuntimeTableIndex {
  const runtimeAssets = def.runtimeDataAssets ?? [];
  const assetsByNormalizedId = new Map<string, (typeof runtimeAssets)[number]>();
  for (const asset of runtimeAssets) {
    const normalizedId = asset.id.normalize('NFC');
    if (!assetsByNormalizedId.has(normalizedId)) {
      assetsByNormalizedId.set(normalizedId, asset);
    }
  }

  const tableContracts = def.tableContracts ?? [];
  const tablesById = new Map<string, RuntimeTableIndexEntry>();

  for (const contract of tableContracts) {
    const fieldNames = new Set(contract.fields.map((field) => field.field));
    const fieldContractsByName = new Map(contract.fields.map((field) => [field.field, field] as const));
    const asset = assetsByNormalizedId.get(contract.assetId.normalize('NFC'));
    if (asset === undefined) {
      tablesById.set(contract.id, {
        contract,
        rows: null,
        fieldNames,
        fieldContractsByName,
        keyIndexesByTuple: buildKeyIndexes(contract, null),
        issue: {
          kind: 'assetMissing',
          assetId: contract.assetId,
        },
      });
      continue;
    }

    const resolvedRows = resolveRowsByTablePath(asset.payload, contract.tablePath);
    tablesById.set(contract.id, {
      contract,
      rows: resolvedRows.rows,
      fieldNames,
      fieldContractsByName,
      keyIndexesByTuple: buildKeyIndexes(contract, resolvedRows.rows),
      ...(resolvedRows.issue === undefined ? {} : { issue: resolvedRows.issue }),
    });
  }

  return {
    tableIds: [...tablesById.keys()].sort((left, right) => left.localeCompare(right)),
    tablesById,
  };
}
