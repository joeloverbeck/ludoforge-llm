import type { PolicyValue } from './policy-surface.js';
import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import { stablePayloadCode, stableStringCode } from '../cnl/policy-bytecode/feature-table.js';
import type { AgentParameterValue, CompiledPolicyConsideration, CompiledPolicyExpr, EncodedState, GameDef } from '../kernel/index.js';
import {
  getCachedScoreRowBytecode,
} from './policy-wasm-score-bytecode-cache.js';
import {
  cachedLayoutIdentity,
  cachedZoneKindCodes,
} from './policy-wasm-layout-encoding-cache.js';
import { hotPathProfilingEnabled, perfHotPathCount, perfHotPathEnd, perfHotPathStart } from '../kernel/perf-profiler.js';
import {
  decodePolicyWasmPreviewDriveRows,
  encodePolicyWasmPreviewDriveInput,
  firstUnsupportedPreviewDriveClass,
  firstUnsupportedPreviewDriveOwner,
  policyWasmPreviewDriveCandidateGroupMetadataWords,
  policyWasmPreviewDriveCompletionRecordWords,
  policyWasmPreviewDriveDecisionStackFrameWords,
  policyWasmPreviewDriveStatePatchOpWords,
  type PolicyWasmPreviewDriveResult,
} from './policy-wasm-preview-drive.js';
import {
  getCachedPolicyWasmBytecodeInput,
  policyWasmBytecodeInputCacheKey,
} from './policy-wasm-bytecode-input-cache.js';
import {
  productionPolicyWasmCounterInternals,
} from './policy-wasm-runtime-counters.js';
import {
  beginPolicyWasmTiming,
  isPolicyWasmTimingProfileEnabled,
  resetPolicyWasmTimingBuckets,
  snapshotPolicyWasmTimingBuckets,
} from './policy-wasm-timing-profile.js';
import type { PolicyScheduleFallbackFired, PolicyScheduleFallbackKind } from './policy-evaluation-core.js';
import {
  encodeWasmPhaseScheduleValue,
  resolveWasmScheduleDistanceRef,
} from './policy-wasm-phase-schedule-encoding.js';
import type {
  PolicyWasmBatchCandidate,
  PolicyWasmBatchPrecomputedInput,
  PolicyWasmBytecodeContext,
  PolicyWasmMoveConsideration,
  PolicyWasmPrecomputedAggregate,
  PolicyWasmPrecomputedCandidateFeature,
  PolicyWasmPrecomputedDynamicCandidateFeature,
  PolicyWasmPrecomputedPreviewCandidateFeature,
  PolicyWasmPrecomputedStateFeature,
  PolicyWasmPreviewOutcome,
  PolicyWasmRuntime,
  PolicyWasmScoreRowsResult,
} from './policy-wasm-runtime-types.js';

export type {
  PolicyWasmBatchCandidate,
  PolicyWasmBytecodeContext,
  PolicyWasmMoveConsideration,
  PolicyWasmPrecomputedAggregate,
  PolicyWasmPrecomputedCandidateFeature,
  PolicyWasmPrecomputedDynamicCandidateFeature,
  PolicyWasmPrecomputedPreviewCandidateFeature,
  PolicyWasmPrecomputedStateFeature,
  PolicyWasmPreviewOutcome,
  PolicyWasmRuntime,
  PolicyWasmRuntimeOptions,
  PolicyWasmScoreRow,
  PolicyWasmScoreRowsResult,
} from './policy-wasm-runtime-types.js';

export const POLICY_WASM_ABI_MAGIC = 0x4c46_5750;
export const POLICY_WASM_ABI_VERSION = 16;
export const POLICY_WASM_SMOKE_LAYOUT_ID = 0x1500_0001;
export const POLICY_WASM_SMOKE_OPCODE_ADD = 1;

const SMOKE_INPUT_BYTES = 24;
const I32_BYTES = 4;
const POLICY_BYTECODE_HEADER_WORDS = 18;
const FEATURE_REF_WORDS = 7;
const HOST_LITTLE_ENDIAN = new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;

const VALUE_UNDEFINED = 0;
const VALUE_NUMBER = 1;
const VALUE_FALSE = 2;
const VALUE_TRUE = 3;
const NO_EXPECTED_LAYOUT_ID = -1;

const FEATURE_KIND_CODE: Readonly<Record<string, number>> = {
  globalVar: 1,
  playerInt: 2,
  globalMarker: 3,
  zoneProp: 4,
  zoneTokenAgg: 5,
  globalTokenAgg: 6,
  globalZoneAgg: 7,
  candidateIntrinsic: 8,
  candidateParam: 9,
  candidateTag: 10,
  candidateTags: 11,
  candidateFeature: 12,
  candidateAggregate: 13,
  stateFeature: 14,
  dynamicSurface: 15,
  dynamicRef: 16,
  phaseIntrinsic: 17,
  scheduleDistance: 18,
};

interface PolicyWasmExports {
  readonly memory: WebAssembly.Memory;
  readonly ludoforge_policy_vm_alloc: (len: number) => number;
  readonly ludoforge_policy_vm_dealloc: (ptr: number, len: number) => void;
  readonly ludoforge_policy_vm_abi_magic: () => number;
  readonly ludoforge_policy_vm_abi_version: () => number;
  readonly ludoforge_policy_vm_smoke_layout_id: () => number;
  readonly ludoforge_policy_vm_evaluate_smoke: (
    inputPtr: number,
    inputLen: number,
    outScorePtr: number,
  ) => number;
  readonly ludoforge_policy_vm_evaluate_bytecode: (
    inputPtr: number,
    inputLen: number,
    outTagPtr: number,
    outValuePtr: number,
  ) => number;
  readonly ludoforge_policy_vm_evaluate_bytecode_batch: (
    inputPtr: number,
    inputLen: number,
    outTagsPtr: number,
    outValuesPtr: number,
    outLen: number,
  ) => number;
  readonly ludoforge_policy_vm_evaluate_preview_drive_batch: (
    inputPtr: number,
    inputLen: number,
    outOutcomesPtr: number,
    outDepthsPtr: number,
    outValuesPtr: number,
    outPreviewStatePtr: number,
    outPreviewStatusesPtr: number,
    outPreviewBranchesPtr: number,
    outTiebreakAfterPreviewNoSignalPtr: number,
    outPolicyPreviewSignalUnavailablePtr: number,
    outCandidateGroupMetadataPtr: number,
    outCandidateGroupMetadataLen: number,
    outDecisionStackPublicationPtr: number,
    outDecisionStackPublicationLen: number,
    outCompletionRecordsPtr: number,
    outCompletionRecordsLen: number,
    outPreviewStateSlotMetadataPtr: number,
    outPreviewStateSlotMetadataLen: number,
    outStatePatchCountsPtr: number,
    outStatePatchOpsPtr: number,
    outStatePatchOpsLen: number,
    outPreviewStateLen: number,
    outLen: number,
  ) => number;
}

let productionPolicyWasmRuntime: PolicyWasmRuntime | null = null;

const assertFiniteI32 = (label: string, value: number): void => {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    // @policy-wasm-throw: contract-violation
    throw new Error(`Policy WASM ${label} must be a signed 32-bit integer.`);
  }
};

const checkedExports = (instance: WebAssembly.Instance): PolicyWasmExports => {
  const exports = instance.exports as Partial<PolicyWasmExports>;
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    // @policy-wasm-throw: contract-violation
    throw new Error('Policy WASM module does not export memory.');
  }
  for (const name of [
    'ludoforge_policy_vm_alloc',
    'ludoforge_policy_vm_dealloc',
    'ludoforge_policy_vm_abi_magic',
    'ludoforge_policy_vm_abi_version',
    'ludoforge_policy_vm_smoke_layout_id',
    'ludoforge_policy_vm_evaluate_smoke',
    'ludoforge_policy_vm_evaluate_bytecode',
    'ludoforge_policy_vm_evaluate_bytecode_batch',
    'ludoforge_policy_vm_evaluate_preview_drive_batch',
  ] as const) {
    if (typeof exports[name] !== 'function') {
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM module is missing export ${name}.`);
    }
  }
  return exports as PolicyWasmExports;
};

const writeI32Array = (words: number[], values: ArrayLike<number>): void => {
  for (let index = 0; index < values.length; index += 1) {
    words.push(values[index] ?? 0);
  }
};

const encodedPolicyBytecodeInputWordCount = (
  bytecode: PolicyBytecode,
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): number =>
  POLICY_BYTECODE_HEADER_WORDS
    + bytecode.instructions.length
    + bytecode.constants.length
    + (bytecode.featureTable.refs.length * FEATURE_REF_WORDS)
    + context.layout.zoneIds.length
    + encoded.tokenZone.length
    + encoded.tokenOccurrenceOffset.length
    + encoded.tokenOccurrenceCount.length
    + 1
    + encoded.tokenOccurrenceZones.length
    + encoded.tokenScalarPropValues.length
    + encoded.tokenScalarPropPresent.length
    + encoded.playerInts.length
    + encoded.zoneInts.length
    + encoded.globals.length
    + 1
    + (encoded.globalMarkers.length * 2);

const wasmFeatureRefWords = (
  ref: PolicyBytecode['featureTable']['refs'][number],
  context: PolicyWasmBytecodeContext,
): readonly number[] => {
  const kindCode = FEATURE_KIND_CODE[ref.kind];
  if (kindCode === undefined) {
    return [-1, ref.layoutIndex, 0, 0, 0, 0, 0];
  }
  const phaseScheduleValue = encodeWasmPhaseScheduleValue(ref, context);
  if (phaseScheduleValue !== undefined) {
    const [tag, raw] = phaseScheduleValue;
    return [kindCode, ref.layoutIndex, tag, raw, 0, 0, 0];
  }
  return [
    kindCode,
    ref.layoutIndex,
    ref.aux[0] ?? 0,
    ref.aux[1] ?? 0,
    ref.aux[2] ?? 0,
    ref.aux[3] ?? 0,
    ref.aux[4] ?? 0,
  ];
};

const policyBytecodeProgramWords = (
  bytecode: PolicyBytecode,
  context: PolicyWasmBytecodeContext,
): Int32Array => {
  const words: number[] = [];
  writeI32Array(words, bytecode.instructions);
  writeI32Array(words, bytecode.constants);
  for (const ref of bytecode.featureTable.refs) {
    writeI32Array(words, wasmFeatureRefWords(ref, context));
  }
  return Int32Array.from(words);
};

const encodedStateWordsCacheKey = (
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): string | undefined => typeof context.state.stateHash === 'bigint'
  ? [
      cachedLayoutIdentity(context.layout, context.def),
      context.state.stateHash.toString(16),
      encoded.tokenIds.length,
    ].join('|')
  : undefined;

const buildEncodedStateWords = (
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): Int32Array => {
  const words: number[] = [];
  writeI32Array(words, cachedZoneKindCodes(context.layout, context.def));
  writeI32Array(words, encoded.tokenZone);
  writeI32Array(words, encoded.tokenOccurrenceOffset);
  writeI32Array(words, encoded.tokenOccurrenceCount);
  words.push(encoded.tokenOccurrenceZones.length);
  writeI32Array(words, encoded.tokenOccurrenceZones);
  writeI32Array(words, encoded.tokenScalarPropValues);
  writeI32Array(words, encoded.tokenScalarPropPresent);
  writeI32Array(words, encoded.playerInts);
  writeI32Array(words, encoded.zoneInts);
  writeI32Array(words, encoded.globals);
  words.push(encoded.globalMarkers.length);
  for (const value of encoded.globalMarkers) {
    words.push(Number(BigInt.asIntN(32, value)));
    words.push(Number(BigInt.asIntN(32, value >> 32n)));
  }
  return Int32Array.from(words);
};

const encodedPolicyBytecodeStateWords = (
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): Int32Array => {
  const cache = context.bytecodeStateWordsCache;
  if (cache === undefined) {
    return buildEncodedStateWords(encoded, context);
  }
  const key = encodedStateWordsCacheKey(encoded, context);
  if (key === undefined) {
    return buildEncodedStateWords(encoded, context);
  }
  const cached = cache.get(key);
  if (cached !== undefined) {
    if (hotPathProfilingEnabled) {
      perfHotPathCount('policyWasmRuntime:encodedStateWordsCacheHit');
    }
    return cached;
  }
  if (hotPathProfilingEnabled) {
    perfHotPathCount('policyWasmRuntime:encodedStateWordsCacheMiss');
  }
  const words = buildEncodedStateWords(encoded, context);
  cache.set(key, words);
  return words;
};

const encodePolicyBytecodeInput = (
  bytecode: PolicyBytecode,
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): Uint8Array => {
  const profileHotPath = hotPathProfilingEnabled;
  const t0 = profileHotPath ? perfHotPathStart() : 0;
  try {
    const layoutId = cachedLayoutIdentity(context.layout, context.def);
    const expectedLayoutId = context.expectedLayoutId ?? layoutId;
    if (HOST_LITTLE_ENDIAN) {
      const headerWords = Int32Array.of(
        POLICY_WASM_ABI_MAGIC,
        POLICY_WASM_ABI_VERSION,
        expectedLayoutId,
        layoutId,
        bytecode.metadata.version,
        bytecode.metadata.targetVmVersion,
        bytecode.instructions.length,
        bytecode.constants.length,
        bytecode.featureTable.refs.length,
        Number(context.state.activePlayer),
        context.playerId ?? Number(context.state.activePlayer),
        context.layout.zoneIds.length,
        encoded.tokenIds.length,
        context.layout.playerIds.length,
        context.layout.tokenLayout.scalarPropIds.length,
        context.layout.varLayout.globalVariableIds.length,
        context.layout.varLayout.perPlayerVariableIds.length,
        context.layout.varLayout.zoneVariableIds.length,
      );
      const programWords = policyBytecodeProgramWords(bytecode, context);
      const stateWords = encodedPolicyBytecodeStateWords(encoded, context);
      const words = new Int32Array(headerWords.length + programWords.length + stateWords.length);
      words.set(headerWords, 0);
      words.set(programWords, headerWords.length);
      words.set(stateWords, headerWords.length + programWords.length);
      if (words.length !== encodedPolicyBytecodeInputWordCount(bytecode, encoded, context)) {
        // @policy-wasm-throw: contract-violation
        throw new Error('Policy WASM bytecode input size drifted.');
      }
      return new Uint8Array(words.buffer);
    }
    const bytes = new Uint8Array(encodedPolicyBytecodeInputWordCount(bytecode, encoded, context) * I32_BYTES);
    const words = HOST_LITTLE_ENDIAN ? new Int32Array(bytes.buffer) : null;
    const view = words === null ? new DataView(bytes.buffer) : null;
    let wordIndex = 0;
    const writeWord = (word: number): void => {
      assertFiniteI32(`bytecode word ${wordIndex}`, word);
      if (words !== null) {
        words[wordIndex] = word;
      } else {
        view!.setInt32(wordIndex * I32_BYTES, word, true);
      }
      wordIndex += 1;
    };
    const writeWords = (values: ArrayLike<number>): void => {
      for (let index = 0; index < values.length; index += 1) {
        writeWord(values[index] ?? 0);
      }
    };
    const writeBigUint64Words = (values: BigUint64Array): void => {
      for (const value of values) {
        writeWord(Number(BigInt.asIntN(32, value)));
        writeWord(Number(BigInt.asIntN(32, value >> 32n)));
      }
    };

    writeWord(POLICY_WASM_ABI_MAGIC);
    writeWord(POLICY_WASM_ABI_VERSION);
    writeWord(expectedLayoutId);
    writeWord(layoutId);
    writeWord(bytecode.metadata.version);
    writeWord(bytecode.metadata.targetVmVersion);
    writeWord(bytecode.instructions.length);
    writeWord(bytecode.constants.length);
    writeWord(bytecode.featureTable.refs.length);
    writeWord(Number(context.state.activePlayer));
    writeWord(context.playerId ?? Number(context.state.activePlayer));
    writeWord(context.layout.zoneIds.length);
    writeWord(encoded.tokenIds.length);
    writeWord(context.layout.playerIds.length);
    writeWord(context.layout.tokenLayout.scalarPropIds.length);
    writeWord(context.layout.varLayout.globalVariableIds.length);
    writeWord(context.layout.varLayout.perPlayerVariableIds.length);
    writeWord(context.layout.varLayout.zoneVariableIds.length);
    if (wordIndex !== POLICY_BYTECODE_HEADER_WORDS) {
      // @policy-wasm-throw: contract-violation
      throw new Error('Policy WASM bytecode header size drifted.');
    }

    writeWords(bytecode.instructions);
    writeWords(bytecode.constants);
    for (const ref of bytecode.featureTable.refs) {
      writeWords(wasmFeatureRefWords(ref, context));
    }

    writeWords(cachedZoneKindCodes(context.layout, context.def));
    writeWords(encoded.tokenZone);
    writeWords(encoded.tokenOccurrenceOffset);
    writeWords(encoded.tokenOccurrenceCount);
    writeWord(encoded.tokenOccurrenceZones.length);
    writeWords(encoded.tokenOccurrenceZones);
    writeWords(encoded.tokenScalarPropValues);
    writeWords(encoded.tokenScalarPropPresent);
    writeWords(encoded.playerInts);
    writeWords(encoded.zoneInts);
    writeWords(encoded.globals);
    writeWord(encoded.globalMarkers.length);
    writeBigUint64Words(encoded.globalMarkers);
    if (wordIndex !== bytes.byteLength / I32_BYTES) {
      // @policy-wasm-throw: contract-violation
      throw new Error('Policy WASM bytecode input size drifted.');
    }
    return bytes;
  } finally {
    if (profileHotPath) {
      perfHotPathEnd('policyWasmRuntime:encodeBytecodeInput', t0);
    }
  }
};

const encodedPolicyBytecodeInputCacheKey = (
  context: PolicyWasmBytecodeContext,
): string | undefined => {
  if (typeof context.state.stateHash !== 'bigint') {
    return undefined;
  }
  const layoutId = cachedLayoutIdentity(context.layout, context.def);
  const expectedLayoutId = context.expectedLayoutId ?? NO_EXPECTED_LAYOUT_ID;
  return [
    layoutId,
    expectedLayoutId,
    context.state.stateHash.toString(16),
    Number(context.state.activePlayer),
    context.playerId ?? Number(context.state.activePlayer),
  ].join('|');
};

const getEncodedPolicyBytecodeInput = (
  bytecode: PolicyBytecode,
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): Uint8Array => {
  if (context.bytecodeInputCache === undefined) {
    return encodePolicyBytecodeInput(bytecode, encoded, context);
  }
  const contextKey = encodedPolicyBytecodeInputCacheKey(context);
  if (contextKey === undefined) {
    return encodePolicyBytecodeInput(bytecode, encoded, context);
  }
  const key = policyWasmBytecodeInputCacheKey(
    bytecode,
    contextKey,
  );
  return getCachedPolicyWasmBytecodeInput(
    context.bytecodeInputCache,
    key,
    () => encodePolicyBytecodeInput(bytecode, encoded, context),
  );
};

const encodedBatchCandidateWordsCache = new WeakMap<readonly PolicyWasmBatchCandidate[], Int32Array>();

const getEncodedBatchCandidateWords = (
  candidates: readonly PolicyWasmBatchCandidate[],
): Int32Array => {
  const cached = encodedBatchCandidateWordsCache.get(candidates);
  if (cached !== undefined) {
    return cached;
  }
  const words: number[] = [];
  for (const candidate of candidates) {
    const params = Object.entries(candidate.params ?? {})
      .map(([id, value]) => encodeCandidateParam(id, value))
      .sort((left, right) => left[0] - right[0]);
    const tags = [...new Set(candidate.tags ?? [])].map(stableStringCode).sort((left, right) => left - right);
    words.push(
      stablePayloadCode({ literal: candidate.actionId }),
      stablePayloadCode({ literal: candidate.stableMoveKey }),
      params.length,
      tags.length,
    );
    for (const [paramCode, tag, value] of params) {
      words.push(paramCode, tag, value);
    }
    writeI32Array(words, tags);
  }
  const encoded = Int32Array.from(words);
  encodedBatchCandidateWordsCache.set(candidates, encoded);
  return encoded;
};

const encodeBatchInput = (
  program: Uint8Array,
  context: PolicyWasmBytecodeContext,
  candidates: readonly PolicyWasmBatchCandidate[],
  precomputed: PolicyWasmBatchPrecomputedInput = {},
): Uint8Array => {
  if (program.byteLength % I32_BYTES !== 0) {
    // @policy-wasm-throw: contract-violation
    throw new Error('Policy WASM batch program must be i32-aligned.');
  }
  const layoutId = cachedLayoutIdentity(context.layout, context.def);
  const expectedLayoutId = context.expectedLayoutId ?? layoutId;
  const words = [
    POLICY_WASM_ABI_MAGIC,
    POLICY_WASM_ABI_VERSION,
    expectedLayoutId,
    layoutId,
    candidates.length,
    program.byteLength / I32_BYTES,
  ];
  const candidateWords = getEncodedBatchCandidateWords(candidates);
  writeI32Array(words, candidateWords);
  const stateFeatures = precomputed.stateFeatures ?? [];
  const candidateFeatures = precomputed.candidateFeatures ?? [];
  const previewCandidateFeatures = precomputed.previewCandidateFeatures ?? [];
  const dynamicCandidateFeatures = precomputed.dynamicCandidateFeatures ?? [];
  const aggregates = precomputed.aggregates ?? [];
  words.push(stateFeatures.length, candidateFeatures.length, previewCandidateFeatures.length, dynamicCandidateFeatures.length, aggregates.length);
  for (const feature of stateFeatures) {
    const [tag, raw] = encodePolicyValue(feature.value);
    words.push(stableStringCode(feature.id), tag, raw);
  }
  for (const feature of candidateFeatures) {
    if (feature.values.length !== candidates.length) {
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM candidate feature "${feature.id}" row count must match candidate count.`);
    }
    words.push(stableStringCode(feature.id), feature.values.length);
    for (const value of feature.values) {
      const [tag, raw] = encodePolicyValue(value);
      words.push(tag, raw);
    }
  }
  for (const feature of previewCandidateFeatures) {
    if (feature.values.length !== candidates.length) {
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM preview candidate feature "${feature.id}" row count must match candidate count.`);
    }
    if (feature.outcomes.length !== candidates.length) {
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM preview candidate feature "${feature.id}" outcome count must match candidate count.`);
    }
    words.push(stableStringCode(feature.id), feature.values.length);
    for (const [index, value] of feature.values.entries()) {
      const [tag, raw] = encodePolicyValue(value);
      words.push(encodePreviewOutcome(feature.outcomes[index]), tag, raw);
    }
  }
  for (const feature of dynamicCandidateFeatures) {
    if (feature.values.length !== candidates.length) {
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM dynamic candidate feature ${feature.code} row count must match candidate count.`);
    }
    words.push(feature.code, feature.values.length);
    for (const value of feature.values) {
      const [tag, raw] = encodePolicyValue(value);
      words.push(tag, raw);
    }
  }
  for (const aggregate of aggregates) {
    const [tag, raw] = encodePolicyValue(aggregate.value);
    words.push(stableStringCode(aggregate.id), tag, raw);
  }
  const headerAndCandidateWords = words.length;
  const bytes = new Uint8Array((headerAndCandidateWords * I32_BYTES) + program.byteLength);
  const view = new DataView(bytes.buffer);
  for (const [index, word] of words.entries()) {
    assertFiniteI32(`batch word ${index}`, word);
    view.setInt32(index * I32_BYTES, word, true);
  }
  bytes.set(program, headerAndCandidateWords * I32_BYTES);
  return bytes;
};

const encodePolicyValue = (value: PolicyValue): readonly [number, number] => {
  if (value === undefined) {
    return [VALUE_UNDEFINED, 0];
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return [VALUE_NUMBER, value];
  }
  if (typeof value === 'boolean') {
    return [value ? VALUE_TRUE : VALUE_FALSE, value ? 1 : 0];
  }
  // @policy-wasm-throw: contract-violation
  throw new Error('Policy WASM precomputed values must be undefined, boolean, or safe integer numbers.');
};

const encodePreviewOutcome = (outcome: PolicyWasmPreviewOutcome | undefined): number => {
  switch (outcome) {
    case 'ready':
      return 1;
    case 'stochastic':
      return 2;
    case 'gated':
      return 3;
    case 'failed':
      return 4;
    case 'unresolved':
      return 5;
    default:
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM preview outcome "${String(outcome)}" is not encodable.`);
  }
};

const encodeCandidateParam = (id: string, value: unknown): readonly [number, number, number] => {
  const paramCode = stableStringCode(id);
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return [paramCode, VALUE_NUMBER, value];
  }
  if (typeof value === 'boolean') {
    return [paramCode, value ? VALUE_TRUE : VALUE_FALSE, value ? 1 : 0];
  }
  if (typeof value === 'string') {
    return [paramCode, VALUE_NUMBER, stablePayloadCode({ literal: value })];
  }
  return [paramCode, VALUE_UNDEFINED, 0];
};

const decodePolicyValue = (tag: number, value: number): PolicyValue => {
  switch (tag) {
    case VALUE_UNDEFINED:
      return undefined;
    case VALUE_NUMBER:
      return value;
    case VALUE_FALSE:
      return false;
    case VALUE_TRUE:
      return true;
    default:
      // @policy-wasm-throw: contract-violation
      throw new Error(`Policy WASM bytecode evaluation returned unknown value tag ${tag}.`);
  }
};

const isUnsupportedWasmError = (error: unknown): boolean =>
  error instanceof Error && /status -14/u.test(error.message);

const supportedBatchValues = (
  runtime: PolicyWasmRuntime,
  bytecode: PolicyBytecode,
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
  candidates: readonly PolicyWasmBatchCandidate[],
  precomputed: PolicyWasmBatchPrecomputedInput,
): readonly PolicyValue[] | null => {
  try {
    return runtime.evaluatePolicyBytecodeBatch(bytecode, encoded, context, candidates, precomputed);
  } catch (error) {
    if (isUnsupportedWasmError(error)) {
      return null;
    }
    // @policy-wasm-throw: contract-violation
    throw error;
  }
};

const literalBatchValues = (
  expr: CompiledPolicyExpr | undefined,
  count: number,
): readonly PolicyValue[] | undefined => {
  if (expr?.kind !== 'literal') {
    return undefined;
  }
  const value = expr.value;
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
    ? Array.from({ length: count }, () => value)
    : undefined;
};

const exprReadsScheduleDistance = (expr: CompiledPolicyExpr | undefined): boolean => {
  if (expr === undefined) {
    return false;
  }
  switch (expr.kind) {
    case 'literal':
    case 'param':
      return false;
    case 'ref':
      return expr.ref.kind === 'scheduleDistance';
    case 'op':
      return expr.args.some(exprReadsScheduleDistance);
    case 'zoneTokenAgg':
      return typeof expr.zone === 'string' ? false : exprReadsScheduleDistance(expr.zone);
    case 'adjacentTokenAgg':
      return typeof expr.anchorZone === 'string' ? false : exprReadsScheduleDistance(expr.anchorZone);
    case 'globalTokenAgg':
    case 'globalZoneAgg':
    case 'zoneProp':
      return false;
    case 'seatAgg':
      return exprReadsScheduleDistance(expr.expr);
  }
};

const exprReadsTopNVisibleScheduleDistance = (def: GameDef, expr: CompiledPolicyExpr | undefined): boolean => {
  if (expr === undefined) {
    return false;
  }
  switch (expr.kind) {
    case 'ref': {
      const ref = expr.ref;
      if (ref.kind !== 'scheduleDistance' || ref.target.kind !== 'boundary') {
        return false;
      }
      const boundaryId = ref.target.boundaryId;
      const boundary = def.phaseBoundaries?.find((entry) => String(entry.id) === String(boundaryId));
      return boundary?.schedule?.kind === 'cardDraw' && boundary.schedule.observerPolicy?.kind === 'topNVisible';
    }
    case 'op':
      return expr.args.some((arg) => exprReadsTopNVisibleScheduleDistance(def, arg));
    case 'zoneTokenAgg':
      return typeof expr.zone === 'string' ? false : exprReadsTopNVisibleScheduleDistance(def, expr.zone);
    case 'adjacentTokenAgg':
      return typeof expr.anchorZone === 'string' ? false : exprReadsTopNVisibleScheduleDistance(def, expr.anchorZone);
    case 'seatAgg':
      return exprReadsTopNVisibleScheduleDistance(def, expr.expr);
    case 'zoneProp':
      return typeof expr.zone === 'string' ? false : exprReadsTopNVisibleScheduleDistance(def, expr.zone);
    case 'literal':
    case 'param':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
      return false;
  }
};

const firstTopNVisibleSchedulePartial = (
  expr: CompiledPolicyExpr | undefined,
  context: PolicyWasmBytecodeContext,
): { readonly lowerBound: number } | undefined => {
  if (expr === undefined) {
    return undefined;
  }
  switch (expr.kind) {
    case 'ref': {
      const ref = expr.ref;
      if (ref.kind !== 'scheduleDistance' || ref.target.kind !== 'boundary') {
        return undefined;
      }
      const target = ref.target;
      const boundary = context.def.phaseBoundaries?.find((entry) => String(entry.id) === String(target.boundaryId));
      if (boundary?.schedule?.kind !== 'cardDraw' || boundary.schedule.observerPolicy?.kind !== 'topNVisible') {
        return undefined;
      }
      const resolution = resolveWasmScheduleDistanceRef(ref, context);
      return resolution.kind === 'partial' ? { lowerBound: resolution.lowerBound } : undefined;
    }
    case 'op':
      for (const arg of expr.args) {
        const partial = firstTopNVisibleSchedulePartial(arg, context);
        if (partial !== undefined) {
          return partial;
        }
      }
      return undefined;
    case 'zoneTokenAgg':
      return typeof expr.zone === 'string' ? undefined : firstTopNVisibleSchedulePartial(expr.zone, context);
    case 'adjacentTokenAgg':
      return typeof expr.anchorZone === 'string' ? undefined : firstTopNVisibleSchedulePartial(expr.anchorZone, context);
    case 'seatAgg':
      return firstTopNVisibleSchedulePartial(expr.expr, context);
    case 'zoneProp':
      return typeof expr.zone === 'string' ? undefined : firstTopNVisibleSchedulePartial(expr.zone, context);
    case 'literal':
    case 'param':
    case 'globalTokenAgg':
    case 'globalZoneAgg':
      return undefined;
  }
};

const applyTopNVisiblePartialFallback = (
  entryId: string,
  fallback: NonNullable<NonNullable<CompiledPolicyConsideration['scheduleFallback']>['onPartial']>['visiblePrefixExhausted'],
  lowerBound: number,
  weight: PolicyValue,
  contribution: number,
): {
  readonly contribution: number;
  readonly fired: PolicyScheduleFallbackFired;
} => {
  if (fallback === 'dropConsideration') {
    return {
      contribution: 0,
      fired: {
        termId: entryId,
        kind: 'dropConsideration',
        reason: 'partial.lowerBound.visiblePrefixExhausted',
      },
    };
  }
  if (fallback === 'noContribution') {
    return {
      contribution: 0,
      fired: {
        termId: entryId,
        kind: 'noContribution',
        reason: 'partial.lowerBound.visiblePrefixExhausted',
      },
    };
  }
  if (fallback === 'useLowerBound') {
    return {
      contribution,
      fired: {
        termId: entryId,
        kind: 'useLowerBound',
        value: lowerBound,
        reason: 'partial.lowerBound.visiblePrefixExhausted',
      },
    };
  }
  const constantContribution = typeof weight === 'number' ? weight * fallback.value : fallback.value;
  return {
    contribution: constantContribution,
    fired: {
      termId: entryId,
      kind: 'constant' satisfies PolicyScheduleFallbackKind,
      value: fallback.value,
      reason: 'partial.lowerBound.visiblePrefixExhausted',
    },
  };
};

export const evaluateWasmMoveConsiderationScoreRows = (
  runtime: PolicyWasmRuntime,
  input: {
    readonly def: GameDef;
    readonly encoded: EncodedState;
    readonly context: PolicyWasmBytecodeContext;
    readonly parameterValues?: Readonly<Record<string, AgentParameterValue>>;
    readonly considerations: readonly PolicyWasmMoveConsideration[];
    readonly candidates: readonly PolicyWasmBatchCandidate[];
    readonly precomputedStateFeatures?: readonly PolicyWasmPrecomputedStateFeature[];
    readonly precomputedCandidateFeatures?: readonly PolicyWasmPrecomputedCandidateFeature[];
    readonly precomputedPreviewCandidateFeatures?: readonly PolicyWasmPrecomputedPreviewCandidateFeature[];
    readonly precomputedDynamicCandidateFeatures?: readonly PolicyWasmPrecomputedDynamicCandidateFeature[];
    readonly precomputedAggregates?: readonly PolicyWasmPrecomputedAggregate[];
  },
): PolicyWasmScoreRowsResult => {
  const scores = input.candidates.map(() => 0);
  const scheduleFallbackFired = input.candidates.map((): PolicyScheduleFallbackFired | undefined => undefined);
  const precomputed: PolicyWasmBatchPrecomputedInput = {
    ...(input.precomputedStateFeatures === undefined ? {} : { stateFeatures: input.precomputedStateFeatures }),
    ...(input.precomputedCandidateFeatures === undefined ? {} : { candidateFeatures: input.precomputedCandidateFeatures }),
    ...(input.precomputedPreviewCandidateFeatures === undefined ? {} : { previewCandidateFeatures: input.precomputedPreviewCandidateFeatures }),
    ...(input.precomputedDynamicCandidateFeatures === undefined ? {} : { dynamicCandidateFeatures: input.precomputedDynamicCandidateFeatures }),
    ...(input.precomputedAggregates === undefined ? {} : { aggregates: input.precomputedAggregates }),
  };
  const previewCandidateFeatureIds = new Set((input.precomputedPreviewCandidateFeatures ?? []).map((feature) => feature.id));
  for (const entry of input.considerations) {
    const consideration = entry.consideration;
    if (consideration.scopes?.includes('move') !== true) {
      continue;
    }
    const readsTopNVisibleScheduleDistance =
      exprReadsTopNVisibleScheduleDistance(input.def, consideration.when)
      || exprReadsTopNVisibleScheduleDistance(input.def, consideration.weight)
      || exprReadsTopNVisibleScheduleDistance(input.def, consideration.value);
    const topNVisiblePartialFallback = consideration.scheduleFallback?.onPartial?.visiblePrefixExhausted;
    if (readsTopNVisibleScheduleDistance && topNVisiblePartialFallback === undefined) {
      return { kind: 'unsupported', reason: `topNVisible schedule-distance consideration ${entry.id} is missing partial fallback` };
    }
    if (consideration.costClass === 'preview') {
      for (const featureId of consideration.dependencies.candidateFeatures) {
        if (!previewCandidateFeatureIds.has(featureId)) {
          return { kind: 'unsupported', reason: `preview-backed consideration ${entry.id} requires preview candidate feature row ${featureId}` };
        }
      }
    }

    const whenValues = consideration.when === undefined
      ? input.candidates.map(() => true as PolicyValue)
      : literalBatchValues(consideration.when, input.candidates.length)
        ?? supportedBatchValues(
          runtime,
          getCachedScoreRowBytecode(consideration.when, input.parameterValues, input.def, input.context.layout),
          input.encoded,
          input.context,
          input.candidates,
          precomputed,
        );
    if (whenValues === null) {
      return { kind: 'unsupported', reason: `unsupported when expression for consideration ${entry.id}` };
    }

    const weightValues = literalBatchValues(consideration.weight, input.candidates.length)
      ?? supportedBatchValues(
        runtime,
        getCachedScoreRowBytecode(consideration.weight, input.parameterValues, input.def, input.context.layout),
        input.encoded,
        input.context,
        input.candidates,
        precomputed,
      );
    if (weightValues === null) {
      return { kind: 'unsupported', reason: `unsupported weight expression for consideration ${entry.id}` };
    }

    const valueValues = literalBatchValues(consideration.value, input.candidates.length)
      ?? supportedBatchValues(
        runtime,
        getCachedScoreRowBytecode(consideration.value, input.parameterValues, input.def, input.context.layout),
        input.encoded,
        input.context,
        input.candidates,
        precomputed,
      );
    if (valueValues === null) {
      return { kind: 'unsupported', reason: `unsupported value expression for consideration ${entry.id}` };
    }
    const topNVisiblePartial = readsTopNVisibleScheduleDistance
      ? firstTopNVisibleSchedulePartial(consideration.when, input.context)
        ?? firstTopNVisibleSchedulePartial(consideration.weight, input.context)
        ?? firstTopNVisibleSchedulePartial(consideration.value, input.context)
      : undefined;

    for (const [index] of input.candidates.entries()) {
      if (whenValues[index] !== true) {
        continue;
      }
      const weight = weightValues[index];
      const value = valueValues[index];
      let contribution: number;
      if (typeof weight === 'number' && typeof value === 'number') {
        contribution = weight * value;
      } else if (
        (exprReadsScheduleDistance(consideration.weight) && weight === undefined)
        || (exprReadsScheduleDistance(consideration.value) && value === undefined)
      ) {
        const fallback = consideration.scheduleFallback?.onUnavailable;
        if (fallback === 'noContribution') {
          scheduleFallbackFired[index] = { termId: entry.id, kind: 'noContribution' };
          contribution = 0;
        } else if (fallback === 'dropConsideration') {
          scheduleFallbackFired[index] = { termId: entry.id, kind: 'dropConsideration' };
          contribution = 0;
        } else if (fallback !== undefined) {
          scheduleFallbackFired[index] = { termId: entry.id, kind: 'constant', value: fallback.value };
          contribution = fallback.value;
        } else {
          contribution = 0;
        }
      } else {
        contribution = consideration.unknownAs ?? 0;
      }
      if (topNVisiblePartial !== undefined) {
        const applied = applyTopNVisiblePartialFallback(
          entry.id,
          topNVisiblePartialFallback!,
          topNVisiblePartial.lowerBound,
          weight,
          contribution,
        );
        contribution = applied.contribution;
        scheduleFallbackFired[index] = applied.fired;
      } else if (consideration.clamp !== undefined) {
        if (consideration.clamp.min !== undefined) {
          contribution = Math.max(consideration.clamp.min, contribution);
        }
        if (consideration.clamp.max !== undefined) {
          contribution = Math.min(consideration.clamp.max, contribution);
        }
      }
      scores[index] = (scores[index] ?? 0) + contribution;
    }
  }
  return {
    kind: 'supported',
    rows: input.candidates.map((candidate, index) => ({
      stableMoveKey: candidate.stableMoveKey,
      score: scores[index] ?? 0,
      ...(scheduleFallbackFired[index] === undefined ? {} : { scheduleFallbackFired: scheduleFallbackFired[index] }),
    })),
  };
};

export const evaluateWasmCandidateFeatureRow = (
  runtime: PolicyWasmRuntime,
  input: {
    readonly def: GameDef;
    readonly encoded: EncodedState;
    readonly context: PolicyWasmBytecodeContext;
    readonly expr: CompiledPolicyExpr;
    readonly parameterValues?: Readonly<Record<string, AgentParameterValue>>;
    readonly candidates: readonly PolicyWasmBatchCandidate[];
    readonly precomputedStateFeatures?: readonly PolicyWasmPrecomputedStateFeature[];
    readonly precomputedCandidateFeatures?: readonly PolicyWasmPrecomputedCandidateFeature[];
    readonly precomputedPreviewCandidateFeatures?: readonly PolicyWasmPrecomputedPreviewCandidateFeature[];
    readonly precomputedDynamicCandidateFeatures?: readonly PolicyWasmPrecomputedDynamicCandidateFeature[];
    readonly precomputedAggregates?: readonly PolicyWasmPrecomputedAggregate[];
  },
): readonly PolicyValue[] | null =>
  literalBatchValues(input.expr, input.candidates.length)
    ?? supportedBatchValues(
      runtime,
      getCachedScoreRowBytecode(input.expr, input.parameterValues, input.def, input.context.layout),
      input.encoded,
      input.context,
      input.candidates,
      {
        ...(input.precomputedStateFeatures === undefined ? {} : { stateFeatures: input.precomputedStateFeatures }),
        ...(input.precomputedCandidateFeatures === undefined ? {} : { candidateFeatures: input.precomputedCandidateFeatures }),
        ...(input.precomputedPreviewCandidateFeatures === undefined ? {} : { previewCandidateFeatures: input.precomputedPreviewCandidateFeatures }),
        ...(input.precomputedDynamicCandidateFeatures === undefined ? {} : { dynamicCandidateFeatures: input.precomputedDynamicCandidateFeatures }),
        ...(input.precomputedAggregates === undefined ? {} : { aggregates: input.precomputedAggregates }),
      },
    );

export const createPolicyWasmRuntime = (
  instance: WebAssembly.Instance,
  wasmPath: string | undefined,
): PolicyWasmRuntime => {
  const wasm = checkedExports(instance);

  if (wasm.ludoforge_policy_vm_abi_magic() !== POLICY_WASM_ABI_MAGIC) {
    // @policy-wasm-throw: contract-violation
    throw new Error('Policy WASM ABI magic mismatch.');
  }
  if (wasm.ludoforge_policy_vm_abi_version() !== POLICY_WASM_ABI_VERSION) {
    // @policy-wasm-throw: contract-violation
    throw new Error('Policy WASM ABI version mismatch.');
  }
  if (wasm.ludoforge_policy_vm_smoke_layout_id() !== POLICY_WASM_SMOKE_LAYOUT_ID) {
    // @policy-wasm-throw: contract-violation
    throw new Error('Policy WASM smoke layout mismatch.');
  }

  return {
    ...(wasmPath === undefined ? {} : { wasmPath }),
    evaluateSmokeAdd: (left: number, right: number, layoutId = POLICY_WASM_SMOKE_LAYOUT_ID): number => {
      assertFiniteI32('left operand', left);
      assertFiniteI32('right operand', right);
      assertFiniteI32('layout id', layoutId);

      const inputPtr = wasm.ludoforge_policy_vm_alloc(SMOKE_INPUT_BYTES);
      const outPtr = wasm.ludoforge_policy_vm_alloc(I32_BYTES);
      try {
        const view = new DataView(wasm.memory.buffer);
        view.setInt32(inputPtr, POLICY_WASM_ABI_MAGIC, true);
        view.setInt32(inputPtr + 4, POLICY_WASM_ABI_VERSION, true);
        view.setInt32(inputPtr + 8, layoutId, true);
        view.setInt32(inputPtr + 12, POLICY_WASM_SMOKE_OPCODE_ADD, true);
        view.setInt32(inputPtr + 16, left, true);
        view.setInt32(inputPtr + 20, right, true);
        const status = wasm.ludoforge_policy_vm_evaluate_smoke(inputPtr, SMOKE_INPUT_BYTES, outPtr);
        if (status !== 0) {
          // @policy-wasm-throw: contract-violation
          throw new Error(`Policy WASM smoke evaluation failed with status ${status}.`);
        }
        return view.getInt32(outPtr, true);
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, SMOKE_INPUT_BYTES);
        wasm.ludoforge_policy_vm_dealloc(outPtr, I32_BYTES);
      }
    },
    evaluatePolicyBytecode: (bytecode, encoded, context): PolicyValue => {
      const timing = beginPolicyWasmTiming(context.timingRouteClass);
      const input = getEncodedPolicyBytecodeInput(bytecode, encoded, context);
      const inputPtr = wasm.ludoforge_policy_vm_alloc(input.byteLength);
      const outTagPtr = wasm.ludoforge_policy_vm_alloc(I32_BYTES);
      const outValuePtr = wasm.ludoforge_policy_vm_alloc(I32_BYTES);
      try {
        new Uint8Array(wasm.memory.buffer, inputPtr, input.byteLength).set(input);
        timing?.finishMarshaling();
        timing?.startExecution();
        const status = wasm.ludoforge_policy_vm_evaluate_bytecode(
          inputPtr,
          input.byteLength,
          outTagPtr,
          outValuePtr,
        );
        timing?.finishExecution();
        if (status !== 0) {
          // @policy-wasm-throw: contract-violation
          throw new Error(`Policy WASM bytecode evaluation failed with status ${status}.`);
        }
        timing?.startDeserialization();
        const view = new DataView(wasm.memory.buffer);
        const value = decodePolicyValue(view.getInt32(outTagPtr, true), view.getInt32(outValuePtr, true));
        timing?.record();
        return value;
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
        wasm.ludoforge_policy_vm_dealloc(outTagPtr, I32_BYTES);
        wasm.ludoforge_policy_vm_dealloc(outValuePtr, I32_BYTES);
      }
    },
    evaluatePolicyBytecodeBatch: (bytecode, encoded, context, candidates, precomputed): readonly PolicyValue[] => {
      const timing = beginPolicyWasmTiming(context.timingRouteClass);
      const program = getEncodedPolicyBytecodeInput(bytecode, encoded, context);
      const input = encodeBatchInput(program, context, candidates, precomputed);
      const outputBytes = candidates.length * I32_BYTES;
      const inputPtr = wasm.ludoforge_policy_vm_alloc(input.byteLength);
      const outTagsPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outValuesPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      try {
        new Uint8Array(wasm.memory.buffer, inputPtr, input.byteLength).set(input);
        timing?.finishMarshaling();
        timing?.startExecution();
        const status = wasm.ludoforge_policy_vm_evaluate_bytecode_batch(
          inputPtr,
          input.byteLength,
          outTagsPtr,
          outValuesPtr,
          candidates.length,
        );
        timing?.finishExecution();
        if (status !== 0) {
          // @policy-wasm-throw: contract-violation
          throw new Error(`Policy WASM bytecode batch evaluation failed with status ${status}.`);
        }
        timing?.startDeserialization();
        const view = new DataView(wasm.memory.buffer);
        const values = candidates.map((_candidate, index) => decodePolicyValue(
          view.getInt32(outTagsPtr + (index * I32_BYTES), true),
          view.getInt32(outValuesPtr + (index * I32_BYTES), true),
        ));
        timing?.record();
        return values;
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
        wasm.ludoforge_policy_vm_dealloc(outTagsPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outValuesPtr, outputBytes);
      }
    },
    evaluatePreviewDriveBatch: (previewInput): PolicyWasmPreviewDriveResult => {
      const timing = beginPolicyWasmTiming('productionPreviewDrive');
      const input = encodePolicyWasmPreviewDriveInput(
        previewInput,
        POLICY_WASM_ABI_MAGIC,
        POLICY_WASM_ABI_VERSION,
      );
      const outputBytes = previewInput.candidates.length * I32_BYTES;
      const previewStateSlotCount = previewInput.previewStateSlots?.length ?? 0;
      const previewStateOutputBytes = previewInput.candidates.length * previewStateSlotCount * I32_BYTES;
      const decisionStackMaxDepth = previewInput.candidates.reduce(
        (maxDepth, candidate) => Math.max(maxDepth, candidate.decisionStackPublication?.maxDepth ?? 0),
        0,
      );
      const decisionStackFrameWordCount = policyWasmPreviewDriveDecisionStackFrameWords();
      const decisionStackPublicationWords = previewInput.candidates.length * decisionStackMaxDepth * decisionStackFrameWordCount;
      const decisionStackPublicationBytes = decisionStackPublicationWords * I32_BYTES;
      const completionRecordMaxCount = previewInput.candidates.reduce(
        (maxCount, candidate) => Math.max(maxCount, candidate.continuedDeepeningCompletionRecords?.length ?? 0),
        0,
      );
      const completionRecordWordCount = policyWasmPreviewDriveCompletionRecordWords();
      const completionRecordWords = previewInput.candidates.length * completionRecordMaxCount * completionRecordWordCount;
      const completionRecordBytes = completionRecordWords * I32_BYTES;
      const statePatchMaxOpCount = previewInput.materializeStatePatch === true
        ? previewInput.candidates.reduce((maxCount, candidate) => Math.max(maxCount, candidate.statePatch?.ops.length ?? 0), 0)
        : 0;
      const statePatchOpWordCount = policyWasmPreviewDriveStatePatchOpWords();
      const statePatchOpWords = previewInput.candidates.length * statePatchMaxOpCount * statePatchOpWordCount;
      const statePatchOpBytes = statePatchOpWords * I32_BYTES;
      const candidateGroupMetadataWords = previewInput.candidates.length * policyWasmPreviewDriveCandidateGroupMetadataWords();
      const candidateGroupMetadataBytes = candidateGroupMetadataWords * I32_BYTES;
      const previewStateSlotMetadataWords = previewStateSlotCount * 3;
      const previewStateSlotMetadataBytes = previewStateSlotMetadataWords * I32_BYTES;
      const inputPtr = wasm.ludoforge_policy_vm_alloc(input.byteLength);
      const outOutcomesPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outDepthsPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outValuesPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outPreviewStatePtr = wasm.ludoforge_policy_vm_alloc(Math.max(I32_BYTES, previewStateOutputBytes));
      const outPreviewStatusesPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outPreviewBranchesPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outTiebreakAfterPreviewNoSignalPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outPolicyPreviewSignalUnavailablePtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outCandidateGroupMetadataPtr = wasm.ludoforge_policy_vm_alloc(Math.max(I32_BYTES, candidateGroupMetadataBytes));
      const outDecisionStackPublicationPtr = wasm.ludoforge_policy_vm_alloc(Math.max(I32_BYTES, decisionStackPublicationBytes));
      const outCompletionRecordsPtr = wasm.ludoforge_policy_vm_alloc(Math.max(I32_BYTES, completionRecordBytes));
      const outPreviewStateSlotMetadataPtr = wasm.ludoforge_policy_vm_alloc(Math.max(I32_BYTES, previewStateSlotMetadataBytes));
      const outStatePatchCountsPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outStatePatchOpsPtr = wasm.ludoforge_policy_vm_alloc(Math.max(I32_BYTES, statePatchOpBytes));
      try {
        new Uint8Array(wasm.memory.buffer, inputPtr, input.byteLength).set(input);
        timing?.finishMarshaling();
        timing?.startExecution();
        const status = wasm.ludoforge_policy_vm_evaluate_preview_drive_batch(
          inputPtr,
          input.byteLength,
          outOutcomesPtr,
          outDepthsPtr,
          outValuesPtr,
          outPreviewStatePtr,
          outPreviewStatusesPtr,
          outPreviewBranchesPtr,
          outTiebreakAfterPreviewNoSignalPtr,
          outPolicyPreviewSignalUnavailablePtr,
          outCandidateGroupMetadataPtr,
          candidateGroupMetadataWords,
          outDecisionStackPublicationPtr,
          decisionStackPublicationWords,
          outCompletionRecordsPtr,
          completionRecordWords,
          outPreviewStateSlotMetadataPtr,
          previewStateSlotMetadataWords,
          outStatePatchCountsPtr,
          outStatePatchOpsPtr,
          statePatchOpWords,
          previewStateSlotCount,
          previewInput.candidates.length,
        );
        timing?.finishExecution();
        timing?.startDeserialization();
        if (status === -14) {
          const unsupportedDriveClass = firstUnsupportedPreviewDriveClass(previewInput) ?? 'unknown';
          const unsupportedOwner = firstUnsupportedPreviewDriveOwner(previewInput);
          const result = {
            kind: 'unsupported',
            profileId: previewInput.profileId,
            candidateCount: previewInput.candidates.length,
            unsupportedDriveClass,
            ...(unsupportedOwner === undefined ? {} : { unsupportedOwner }),
            reason: `unsupported preview-drive class ${unsupportedDriveClass}`,
          } satisfies PolicyWasmPreviewDriveResult;
          timing?.record();
          return result;
        }
        if (status !== 0) {
          // @policy-wasm-throw: contract-violation
          throw new Error(`Policy WASM preview-drive batch failed with status ${status}.`);
        }
        const result = {
          kind: 'supported',
          profileId: previewInput.profileId,
          rows: decodePolicyWasmPreviewDriveRows(
            previewInput,
            wasm.memory.buffer,
            outOutcomesPtr,
            outDepthsPtr,
            outValuesPtr,
            outPreviewStatePtr,
            outPreviewStatusesPtr,
            outPreviewBranchesPtr,
            outTiebreakAfterPreviewNoSignalPtr,
            outPolicyPreviewSignalUnavailablePtr,
            outCandidateGroupMetadataPtr,
            outDecisionStackPublicationPtr,
            outCompletionRecordsPtr,
            outPreviewStateSlotMetadataPtr,
            outStatePatchCountsPtr,
            outStatePatchOpsPtr,
            decisionStackMaxDepth,
            completionRecordMaxCount,
            statePatchMaxOpCount,
          ),
        } satisfies PolicyWasmPreviewDriveResult;
        timing?.record();
        return result;
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
        wasm.ludoforge_policy_vm_dealloc(outOutcomesPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outDepthsPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outValuesPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outPreviewStatePtr, Math.max(I32_BYTES, previewStateOutputBytes));
        wasm.ludoforge_policy_vm_dealloc(outPreviewStatusesPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outPreviewBranchesPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outTiebreakAfterPreviewNoSignalPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outPolicyPreviewSignalUnavailablePtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outCandidateGroupMetadataPtr, Math.max(I32_BYTES, candidateGroupMetadataBytes));
        wasm.ludoforge_policy_vm_dealloc(outDecisionStackPublicationPtr, Math.max(I32_BYTES, decisionStackPublicationBytes));
        wasm.ludoforge_policy_vm_dealloc(outCompletionRecordsPtr, Math.max(I32_BYTES, completionRecordBytes));
        wasm.ludoforge_policy_vm_dealloc(outPreviewStateSlotMetadataPtr, Math.max(I32_BYTES, previewStateSlotMetadataBytes));
        wasm.ludoforge_policy_vm_dealloc(outStatePatchCountsPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outStatePatchOpsPtr, Math.max(I32_BYTES, statePatchOpBytes));
      }
    },
  };
};

export const getInitializedPolicyWasmRuntime = (): PolicyWasmRuntime | null =>
  productionPolicyWasmRuntime;

export {
  getProductionPolicyWasmPreviewDriveRouteCount,
  getProductionPolicyWasmPreviewDriveUnsupportedCount,
  getProductionPolicyWasmPreviewDriveUnsupportedReasonCounts,
  type PolicyWasmPreviewDriveUnsupportedDetail,
  recordProductionPolicyWasmPreviewCandidateFeatureRows,
  recordProductionPolicyWasmPreviewDrive,
  recordProductionPolicyWasmScoreRows,
} from './policy-wasm-runtime-counters.js';

export const __internal_for_tests = {
  setInitializedPolicyWasmRuntime(runtime: PolicyWasmRuntime | null): void {
    productionPolicyWasmRuntime = runtime;
  },
  ...productionPolicyWasmCounterInternals,
  isPolicyWasmTimingProfileEnabled,
  resetPolicyWasmTimingBuckets,
  snapshotPolicyWasmTimingBuckets,
  encodePolicyBytecodeInputForTest(
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: PolicyWasmBytecodeContext,
  ): Uint8Array {
    return encodePolicyBytecodeInput(bytecode, encoded, context);
  },
  getEncodedPolicyBytecodeInputForTest(
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: PolicyWasmBytecodeContext,
  ): Uint8Array {
    return getEncodedPolicyBytecodeInput(bytecode, encoded, context);
  },
};
