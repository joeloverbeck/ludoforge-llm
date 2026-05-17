export type PolicyWasmTimingRouteClass =
  | 'scoreRows'
  | 'previewCandidateFeatureRows'
  | 'productionPreviewDrive';

export interface PolicyWasmTimingBucket {
  readonly marshalingNs: number;
  readonly executionNs: number;
  readonly deserializationNs: number;
  readonly callCount: number;
  readonly batchSizeSum: number;
  readonly batchSizeMin: number;
  readonly batchSizeMax: number;
  readonly batchSizeHistogram: Readonly<Record<string, number>>;
}

export type PolicyWasmTimingBucketSnapshot = Readonly<Record<PolicyWasmTimingRouteClass, PolicyWasmTimingBucket>>;

export interface PolicyWasmTimingRecorder {
  finishMarshaling(): void;
  startExecution(): void;
  finishExecution(): void;
  startDeserialization(): void;
  record(batchSize?: number): void;
}

const ROUTE_CLASSES: readonly PolicyWasmTimingRouteClass[] = [
  'scoreRows',
  'previewCandidateFeatureRows',
  'productionPreviewDrive',
];

const POLICY_WASM_TIMING_PROFILE_ENABLED = process.env.POLICY_WASM_TIMING_PROFILE === '1';

const createEmptyBucket = (): PolicyWasmTimingBucket => ({
  marshalingNs: 0,
  executionNs: 0,
  deserializationNs: 0,
  callCount: 0,
  batchSizeSum: 0,
  batchSizeMin: 0,
  batchSizeMax: 0,
  batchSizeHistogram: {},
});

const timingBuckets: Record<PolicyWasmTimingRouteClass, PolicyWasmTimingBucket> = {
  scoreRows: createEmptyBucket(),
  previewCandidateFeatureRows: createEmptyBucket(),
  productionPreviewDrive: createEmptyBucket(),
};

export const isPolicyWasmTimingProfileEnabled = (): boolean =>
  POLICY_WASM_TIMING_PROFILE_ENABLED;

const elapsedNs = (startedAt: number): number =>
  Math.max(0, Math.round((performance.now() - startedAt) * 1_000_000));

export const beginPolicyWasmTiming = (
  routeClass: PolicyWasmTimingRouteClass | undefined,
): PolicyWasmTimingRecorder | null => {
  if (routeClass === undefined || !POLICY_WASM_TIMING_PROFILE_ENABLED) {
    return null;
  }
  let startedAt = performance.now();
  let marshalingNs = 0;
  let executionNs = 0;
  let deserializationNs = 0;
  return {
    finishMarshaling(): void {
      marshalingNs = elapsedNs(startedAt);
    },
    startExecution(): void {
      startedAt = performance.now();
    },
    finishExecution(): void {
      executionNs = elapsedNs(startedAt);
    },
    startDeserialization(): void {
      startedAt = performance.now();
    },
    record(batchSize?: number): void {
      deserializationNs = elapsedNs(startedAt);
      recordPolicyWasmTimingBucket(routeClass, {
        marshalingNs,
        executionNs,
        deserializationNs,
        ...(batchSize === undefined ? {} : { batchSize }),
      });
    },
  };
};

const batchSizeHistogramLabel = (batchSize: number): string => {
  if (batchSize <= 1) {
    return '1';
  }
  if (batchSize <= 4) {
    return '2-4';
  }
  if (batchSize <= 8) {
    return '5-8';
  }
  if (batchSize <= 16) {
    return '9-16';
  }
  if (batchSize <= 32) {
    return '17-32';
  }
  return '33+';
};

export const resetPolicyWasmTimingBuckets = (): void => {
  for (const routeClass of ROUTE_CLASSES) {
    timingBuckets[routeClass] = createEmptyBucket();
  }
};

export const recordPolicyWasmTimingBucket = (
  routeClass: PolicyWasmTimingRouteClass,
  elapsed: Pick<PolicyWasmTimingBucket, 'marshalingNs' | 'executionNs' | 'deserializationNs'> & {
    readonly batchSize?: number;
  },
): void => {
  if (!POLICY_WASM_TIMING_PROFILE_ENABLED) {
    return;
  }
  const current = timingBuckets[routeClass];
  const batchSize = elapsed.batchSize;
  const hasBatchSize = Number.isFinite(batchSize);
  const normalizedBatchSize = hasBatchSize ? batchSize as number : 0;
  const histogramLabel = hasBatchSize ? batchSizeHistogramLabel(normalizedBatchSize) : undefined;
  timingBuckets[routeClass] = {
    marshalingNs: current.marshalingNs + elapsed.marshalingNs,
    executionNs: current.executionNs + elapsed.executionNs,
    deserializationNs: current.deserializationNs + elapsed.deserializationNs,
    callCount: current.callCount + 1,
    batchSizeSum: current.batchSizeSum + normalizedBatchSize,
    batchSizeMin: hasBatchSize
      ? (current.batchSizeMin === 0 ? normalizedBatchSize : Math.min(current.batchSizeMin, normalizedBatchSize))
      : current.batchSizeMin,
    batchSizeMax: hasBatchSize ? Math.max(current.batchSizeMax, normalizedBatchSize) : current.batchSizeMax,
    batchSizeHistogram: histogramLabel === undefined
      ? current.batchSizeHistogram
      : {
        ...current.batchSizeHistogram,
        [histogramLabel]: (current.batchSizeHistogram[histogramLabel] ?? 0) + 1,
      },
  };
};

export const snapshotPolicyWasmTimingBuckets = (): PolicyWasmTimingBucketSnapshot => ({
  scoreRows: {
    ...timingBuckets.scoreRows,
    batchSizeHistogram: { ...timingBuckets.scoreRows.batchSizeHistogram },
  },
  previewCandidateFeatureRows: {
    ...timingBuckets.previewCandidateFeatureRows,
    batchSizeHistogram: { ...timingBuckets.previewCandidateFeatureRows.batchSizeHistogram },
  },
  productionPreviewDrive: {
    ...timingBuckets.productionPreviewDrive,
    batchSizeHistogram: { ...timingBuckets.productionPreviewDrive.batchSizeHistogram },
  },
});
