import {
  getPolicyWasmBytecodeInputCacheCounters,
  resetPolicyWasmBytecodeInputCacheCounters,
  snapshotPolicyWasmBytecodeInputCacheWriteStats,
  type PolicyWasmBytecodeInputCacheWriteStats,
} from './policy-wasm-bytecode-input-cache.js';
import {
  getScoreRowBytecodeCacheHitCount,
  getScoreRowBytecodeCacheMissCount,
  getScoreRowBytecodeCompileTimeMs,
  getScoreRowBytecodeCompileCount,
  resetScoreRowBytecodeCompileCount,
  snapshotPolicyWasmBytecodeCacheAxisStats,
  type PolicyWasmBytecodeCacheAxisStats,
} from './policy-wasm-score-bytecode-cache.js';

export interface PolicyWasmPreviewDriveUnsupportedDetail {
  readonly unsupportedDriveClass?: string;
  readonly unsupportedOwner?: string;
  readonly reason?: string;
  readonly projectedStateBoundaryKind?: string;
  readonly projectedStateClassification?: string;
}

export interface PolicyWasmPreviewDriveUnsupportedReasonCount {
  readonly unsupportedDriveClass: string;
  readonly unsupportedOwner?: string;
  readonly reason: string;
  readonly projectedStateBoundaryKind?: string;
  readonly projectedStateClassification?: string;
  readonly count: number;
}

let productionScoreRowRouteCount = 0;
let productionScoreRowUnsupportedCount = 0;
let productionPreviewCandidateFeatureRowRouteCount = 0;
let productionPreviewCandidateFeatureRowUnsupportedCount = 0;
let productionPreviewDriveRouteCount = 0;
let productionPreviewDriveUnsupportedCount = 0;
const productionPreviewDriveUnsupportedReasonCounts = new Map<string, PolicyWasmPreviewDriveUnsupportedReasonCount>();

export const recordProductionPolicyWasmScoreRows = (kind: 'supported' | 'unsupported'): void => {
  if (kind === 'supported') {
    productionScoreRowRouteCount += 1;
  } else {
    productionScoreRowUnsupportedCount += 1;
  }
};

export const recordProductionPolicyWasmPreviewCandidateFeatureRows = (kind: 'supported' | 'unsupported'): void => {
  if (kind === 'supported') {
    productionPreviewCandidateFeatureRowRouteCount += 1;
  } else {
    productionPreviewCandidateFeatureRowUnsupportedCount += 1;
  }
};

export const recordProductionPolicyWasmPreviewDrive = (
  kind: 'supported' | 'unsupported',
  detail: PolicyWasmPreviewDriveUnsupportedDetail = {},
): void => {
  if (kind === 'supported') {
    productionPreviewDriveRouteCount += 1;
    return;
  }
  productionPreviewDriveUnsupportedCount += 1;
  const row = normalizeUnsupportedDetail(detail);
  const key = unsupportedReasonKey(row);
  const current = productionPreviewDriveUnsupportedReasonCounts.get(key);
  productionPreviewDriveUnsupportedReasonCounts.set(key, {
    ...row,
    count: (current?.count ?? 0) + 1,
  });
};

export const getProductionPolicyWasmPreviewDriveRouteCount = (): number =>
  productionPreviewDriveRouteCount;

export const getProductionPolicyWasmPreviewDriveUnsupportedCount = (): number =>
  productionPreviewDriveUnsupportedCount;

export const getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts = (): readonly PolicyWasmPreviewDriveUnsupportedReasonCount[] =>
  [...productionPreviewDriveUnsupportedReasonCounts.values()]
    .sort((left, right) =>
      right.count - left.count
      || compareCodepoint(left.unsupportedDriveClass, right.unsupportedDriveClass)
      || compareCodepoint(left.unsupportedOwner ?? '', right.unsupportedOwner ?? '')
      || compareCodepoint(left.reason, right.reason),
    );

export const productionPolicyWasmCounterInternals = {
  getProductionScoreRowRouteCount(): number {
    return productionScoreRowRouteCount;
  },
  getProductionScoreRowUnsupportedCount(): number {
    return productionScoreRowUnsupportedCount;
  },
  getProductionScoreRowBytecodeCompileCount(): number {
    return getScoreRowBytecodeCompileCount();
  },
  getProductionScoreRowBytecodeCacheHitCount(): number {
    return getScoreRowBytecodeCacheHitCount();
  },
  getProductionScoreRowBytecodeCacheMissCount(): number {
    return getScoreRowBytecodeCacheMissCount();
  },
  getProductionScoreRowBytecodeCompileTimeMs(): number {
    return getScoreRowBytecodeCompileTimeMs();
  },
  snapshotPolicyWasmBytecodeCacheAxisStats(): Record<string, PolicyWasmBytecodeCacheAxisStats> {
    return snapshotPolicyWasmBytecodeCacheAxisStats();
  },
  getPolicyWasmBytecodeInputCacheCounters(): {
    readonly hitCount: number;
    readonly missCount: number;
    readonly writeCount: number;
  } {
    return getPolicyWasmBytecodeInputCacheCounters();
  },
  snapshotPolicyWasmBytecodeInputCacheWriteStats(): Record<string, PolicyWasmBytecodeInputCacheWriteStats> {
    return snapshotPolicyWasmBytecodeInputCacheWriteStats();
  },
  getProductionPreviewCandidateFeatureRowRouteCount(): number {
    return productionPreviewCandidateFeatureRowRouteCount;
  },
  getProductionPreviewCandidateFeatureRowUnsupportedCount(): number {
    return productionPreviewCandidateFeatureRowUnsupportedCount;
  },
  getProductionPreviewDriveRouteCount(): number {
    return productionPreviewDriveRouteCount;
  },
  getProductionPreviewDriveUnsupportedCount(): number {
    return productionPreviewDriveUnsupportedCount;
  },
  getProductionPreviewDriveUnsupportedReasonCounts(): readonly PolicyWasmPreviewDriveUnsupportedReasonCount[] {
    return getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts();
  },
  resetProductionScoreRowCounters(): void {
    productionScoreRowRouteCount = 0;
    productionScoreRowUnsupportedCount = 0;
    productionPreviewCandidateFeatureRowRouteCount = 0;
    productionPreviewCandidateFeatureRowUnsupportedCount = 0;
    productionPreviewDriveRouteCount = 0;
    productionPreviewDriveUnsupportedCount = 0;
    productionPreviewDriveUnsupportedReasonCounts.clear();
    resetScoreRowBytecodeCompileCount();
    resetPolicyWasmBytecodeInputCacheCounters();
  },
};

const normalizeUnsupportedDetail = (
  detail: PolicyWasmPreviewDriveUnsupportedDetail,
): PolicyWasmPreviewDriveUnsupportedReasonCount => ({
  unsupportedDriveClass: detail.unsupportedDriveClass ?? 'unknown',
  ...(detail.unsupportedOwner === undefined ? {} : { unsupportedOwner: detail.unsupportedOwner }),
  reason: detail.reason ?? 'unspecified unsupported preview-drive route',
  ...(detail.projectedStateBoundaryKind === undefined
    ? {}
    : { projectedStateBoundaryKind: detail.projectedStateBoundaryKind }),
  ...(detail.projectedStateClassification === undefined
    ? {}
    : { projectedStateClassification: detail.projectedStateClassification }),
  count: 0,
});

const unsupportedReasonKey = (row: PolicyWasmPreviewDriveUnsupportedReasonCount): string =>
  [
    row.unsupportedDriveClass,
    row.unsupportedOwner ?? '',
    row.reason,
    row.projectedStateBoundaryKind ?? '',
    row.projectedStateClassification ?? '',
  ].join('\u0000');

const compareCodepoint = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
