type AssetRow = Readonly<Record<string, unknown>>;

export type RuntimeTablePathIssue =
  | { readonly kind: 'tablePathEmpty' }
  | { readonly kind: 'tablePathMissing'; readonly segment: string; readonly segmentIndex: number; readonly availableKeys: readonly string[] }
  | { readonly kind: 'tablePathTypeInvalid'; readonly segment: string; readonly segmentIndex: number; readonly actualType: string }
  | { readonly kind: 'tableTypeInvalid'; readonly actualType: string }
  | { readonly kind: 'rowTypeInvalid'; readonly rowIndex: number; readonly actualType: string };

export function resolveRuntimeTableRowsByPath(
  payload: unknown,
  tablePath: string,
): {
  readonly rows: readonly AssetRow[] | null;
  readonly issue?: RuntimeTablePathIssue;
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
