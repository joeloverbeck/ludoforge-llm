import type { GameDef, RuntimeTableContract } from './types.js';
import { resolveRuntimeTableRowsByPath, type RuntimeTablePathIssue } from './runtime-table-path.js';

type AssetRow = Readonly<Record<string, unknown>>;
type PredicateScalar = string | number | boolean;

export type RuntimeTableIssue =
  | { readonly kind: 'assetMissing'; readonly assetId: string }
  | RuntimeTablePathIssue;

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

    const resolvedRows = resolveRuntimeTableRowsByPath(asset.payload, contract.tablePath);
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
