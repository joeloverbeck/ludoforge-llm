import type { GameDef, RuntimeTableContract } from './types.js';

type AssetRow = Readonly<Record<string, unknown>>;

type RuntimeTableIssue =
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
  readonly issue?: RuntimeTableIssue;
}

export interface RuntimeTableIndex {
  readonly tableIds: readonly string[];
  readonly tablesById: ReadonlyMap<string, RuntimeTableIndexEntry>;
}

const runtimeTableIndexCache = new WeakMap<GameDef, RuntimeTableIndex>();

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
    const asset = assetsByNormalizedId.get(contract.assetId.normalize('NFC'));
    if (asset === undefined) {
      tablesById.set(contract.id, {
        contract,
        rows: null,
        fieldNames,
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
      ...(resolvedRows.issue === undefined ? {} : { issue: resolvedRows.issue }),
    });
  }

  return {
    tableIds: [...tablesById.keys()].sort((left, right) => left.localeCompare(right)),
    tablesById,
  };
}

export function getRuntimeTableIndex(def: GameDef): RuntimeTableIndex {
  const cached = runtimeTableIndexCache.get(def);
  if (cached !== undefined) {
    return cached;
  }

  const built = buildRuntimeTableIndex(def);
  runtimeTableIndexCache.set(def, built);
  return built;
}
