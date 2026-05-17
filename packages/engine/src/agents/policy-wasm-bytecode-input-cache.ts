import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import type { PolicyWasmBytecodeInputCache } from '../kernel/index.js';
import { hotPathProfilingEnabled, perfHotPathCount } from '../kernel/perf-profiler.js';
import { isPolicyWasmTimingProfileEnabled } from './policy-wasm-timing-profile.js';

let bytecodeInputCacheHitCount = 0;
let bytecodeInputCacheMissCount = 0;
let bytecodeInputCacheWriteCount = 0;
const bytecodeInputCacheWriteStats = new Map<string, {
  readonly totalWriteMs: number;
  readonly totalWriteBytes: number;
  readonly writeCount: number;
}>();

export interface PolicyWasmBytecodeInputCacheWriteStats {
  readonly totalWriteMs: number;
  readonly totalWriteBytes: number;
  readonly writeCount: number;
}

const compareOrdinalStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const bytecodeStructuralKey = (bytecode: PolicyBytecode): string => {
  const refs = bytecode.featureTable.refs
    .map((ref) => `${ref.kind}:${ref.layoutIndex}:${ref.aux.join(',')}`)
    .join(';');
  return [
    bytecode.metadata.version,
    bytecode.metadata.targetVmVersion,
    bytecode.metadata.sourceFingerprint,
    bytecode.instructions.join(','),
    bytecode.constants.join(','),
    refs,
  ].join('|');
};

export const policyWasmBytecodeInputCacheKey = (
  bytecode: PolicyBytecode,
  contextKey: string,
): string => {
  return [
    bytecodeStructuralKey(bytecode),
    contextKey,
  ].join('|');
};

export const getCachedPolicyWasmBytecodeInput = (
  cache: PolicyWasmBytecodeInputCache | undefined,
  key: string,
  encode: () => Uint8Array,
  axisLabel?: string,
): Uint8Array => {
  if (cache === undefined) {
    return encode();
  }
  const cached = cache.get(key);
  if (cached !== undefined) {
    bytecodeInputCacheHitCount += 1;
    if (hotPathProfilingEnabled) {
      perfHotPathCount('policyWasmRuntime:encodedInputCacheHit');
    }
    return cached;
  }
  bytecodeInputCacheMissCount += 1;
  if (hotPathProfilingEnabled) {
    perfHotPathCount('policyWasmRuntime:encodedInputCacheMiss');
  }
  const startedAt = isPolicyWasmTimingProfileEnabled() && axisLabel !== undefined ? performance.now() : 0;
  const input = encode();
  cache.set(key, input);
  bytecodeInputCacheWriteCount += 1;
  if (startedAt !== 0 && axisLabel !== undefined) {
    const current = bytecodeInputCacheWriteStats.get(axisLabel) ?? { totalWriteMs: 0, totalWriteBytes: 0, writeCount: 0 };
    bytecodeInputCacheWriteStats.set(axisLabel, {
      totalWriteMs: current.totalWriteMs + (performance.now() - startedAt),
      totalWriteBytes: current.totalWriteBytes + input.byteLength,
      writeCount: current.writeCount + 1,
    });
  }
  return input;
};

export const getPolicyWasmBytecodeInputCacheCounters = (): {
  readonly hitCount: number;
  readonly missCount: number;
  readonly writeCount: number;
} => ({
  hitCount: bytecodeInputCacheHitCount,
  missCount: bytecodeInputCacheMissCount,
  writeCount: bytecodeInputCacheWriteCount,
});

export const resetPolicyWasmBytecodeInputCacheCounters = (): void => {
  bytecodeInputCacheHitCount = 0;
  bytecodeInputCacheMissCount = 0;
  bytecodeInputCacheWriteCount = 0;
  bytecodeInputCacheWriteStats.clear();
};

export const snapshotPolicyWasmBytecodeInputCacheWriteStats = (): Record<string, PolicyWasmBytecodeInputCacheWriteStats> =>
  Object.fromEntries([...bytecodeInputCacheWriteStats.entries()].sort(([left], [right]) => compareOrdinalStrings(left, right)));
