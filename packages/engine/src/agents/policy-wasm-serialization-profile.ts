import { isPolicyWasmTimingProfileEnabled } from './policy-wasm-timing-profile.js';

export interface PolicyWasmSerializationStats {
  readonly totalBytes: number;
  readonly callCount: number;
}

const serializationStats = new Map<string, PolicyWasmSerializationStats>();

const compareOrdinalStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

export const recordPolicyWasmSerializationBytes = (
  axisLabel: string | undefined,
  byteLength: number,
): void => {
  if (axisLabel === undefined || !isPolicyWasmTimingProfileEnabled()) {
    return;
  }
  const current = serializationStats.get(axisLabel) ?? { totalBytes: 0, callCount: 0 };
  serializationStats.set(axisLabel, {
    totalBytes: current.totalBytes + byteLength,
    callCount: current.callCount + 1,
  });
};

export const snapshotPolicyWasmSerializationStats = (): Record<string, PolicyWasmSerializationStats> =>
  Object.fromEntries([...serializationStats.entries()].sort(([left], [right]) => compareOrdinalStrings(left, right)));

export const resetPolicyWasmSerializationStats = (): void => {
  serializationStats.clear();
};
