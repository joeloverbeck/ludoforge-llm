export type PolicyWasmTimingRouteClass =
  | 'scoreRows'
  | 'previewCandidateFeatureRows'
  | 'productionPreviewDrive';

export interface PolicyWasmTimingBucket {
  readonly marshalingNs: number;
  readonly executionNs: number;
  readonly deserializationNs: number;
  readonly callCount: number;
}

export type PolicyWasmTimingBucketSnapshot = Readonly<Record<PolicyWasmTimingRouteClass, PolicyWasmTimingBucket>>;

export interface PolicyWasmTimingRecorder {
  finishMarshaling(): void;
  startExecution(): void;
  finishExecution(): void;
  startDeserialization(): void;
  record(): void;
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
    record(): void {
      deserializationNs = elapsedNs(startedAt);
      recordPolicyWasmTimingBucket(routeClass, { marshalingNs, executionNs, deserializationNs });
    },
  };
};

export const resetPolicyWasmTimingBuckets = (): void => {
  for (const routeClass of ROUTE_CLASSES) {
    timingBuckets[routeClass] = createEmptyBucket();
  }
};

export const recordPolicyWasmTimingBucket = (
  routeClass: PolicyWasmTimingRouteClass,
  elapsed: Omit<PolicyWasmTimingBucket, 'callCount'>,
): void => {
  if (!POLICY_WASM_TIMING_PROFILE_ENABLED) {
    return;
  }
  const current = timingBuckets[routeClass];
  timingBuckets[routeClass] = {
    marshalingNs: current.marshalingNs + elapsed.marshalingNs,
    executionNs: current.executionNs + elapsed.executionNs,
    deserializationNs: current.deserializationNs + elapsed.deserializationNs,
    callCount: current.callCount + 1,
  };
};

export const snapshotPolicyWasmTimingBuckets = (): PolicyWasmTimingBucketSnapshot => ({
  scoreRows: { ...timingBuckets.scoreRows },
  previewCandidateFeatureRows: { ...timingBuckets.previewCandidateFeatureRows },
  productionPreviewDrive: { ...timingBuckets.productionPreviewDrive },
});
