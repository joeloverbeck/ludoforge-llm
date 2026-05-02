import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PolicyValue } from './policy-surface.js';
import type { PolicyBytecode } from '../cnl/policy-bytecode/index.js';
import type { EncodedState, EncodedStateLayout, GameDef, GameState } from '../kernel/index.js';

export const POLICY_WASM_ABI_MAGIC = 0x4c46_5750;
export const POLICY_WASM_ABI_VERSION = 1;
export const POLICY_WASM_SMOKE_LAYOUT_ID = 0x1500_0001;
export const POLICY_WASM_SMOKE_OPCODE_ADD = 1;

const SMOKE_INPUT_BYTES = 24;
const I32_BYTES = 4;
const POLICY_BYTECODE_HEADER_WORDS = 18;
const FEATURE_REF_WORDS = 7;

const VALUE_UNDEFINED = 0;
const VALUE_NUMBER = 1;
const VALUE_FALSE = 2;
const VALUE_TRUE = 3;

const FEATURE_KIND_CODE: Readonly<Record<string, number>> = {
  globalVar: 1,
  playerInt: 2,
  globalMarker: 3,
  zoneProp: 4,
  zoneTokenAgg: 5,
  globalTokenAgg: 6,
  globalZoneAgg: 7,
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
}

export interface PolicyWasmRuntimeOptions {
  readonly wasmPath?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
}

export interface PolicyWasmBytecodeContext {
  readonly def: GameDef;
  readonly layout: EncodedStateLayout;
  readonly state: GameState;
  readonly playerId?: number;
  readonly expectedLayoutId?: number;
}

export interface PolicyWasmBatchCandidate {
  readonly actionId: string;
  readonly stableMoveKey: string;
}

export interface PolicyWasmRuntime {
  readonly wasmPath?: string;
  evaluateSmokeAdd(left: number, right: number, layoutId?: number): number;
  evaluatePolicyBytecode(
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: PolicyWasmBytecodeContext,
  ): PolicyValue;
  evaluatePolicyBytecodeBatch(
    bytecode: PolicyBytecode,
    encoded: EncodedState,
    context: PolicyWasmBytecodeContext,
    candidates: readonly PolicyWasmBatchCandidate[],
  ): readonly PolicyValue[];
}

const findRepoRoot = (startUrl: string): string => {
  let cursor = dirname(fileURLToPath(startUrl));
  for (;;) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) {
      throw new Error(`Unable to locate repository root from ${startUrl}.`);
    }
    cursor = parent;
  }
};

export const defaultPolicyWasmPath = (): string => join(
  findRepoRoot(import.meta.url),
  'packages',
  'engine-wasm',
  'policy-vm',
  'target',
  'wasm32-unknown-unknown',
  'release',
  'ludoforge_policy_vm.wasm',
);

const asBytes = (bytes: Uint8Array | ArrayBuffer): Uint8Array =>
  bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

const assertFiniteI32 = (label: string, value: number): void => {
  if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) {
    throw new Error(`Policy WASM ${label} must be a signed 32-bit integer.`);
  }
};

const checkedExports = (instance: WebAssembly.Instance): PolicyWasmExports => {
  const exports = instance.exports as Partial<PolicyWasmExports>;
  if (!(exports.memory instanceof WebAssembly.Memory)) {
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
  ] as const) {
    if (typeof exports[name] !== 'function') {
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

const writeBigUint64Array = (words: number[], values: BigUint64Array): void => {
  for (const value of values) {
    words.push(Number(BigInt.asIntN(32, value)));
    words.push(Number(BigInt.asIntN(32, value >> 32n)));
  }
};

const layoutIdentity = (layout: EncodedStateLayout, def: GameDef): number => {
  let hash = 0x811c9dc5;
  const mix = (value: number): void => {
    hash ^= value | 0;
    hash = Math.imul(hash, 0x01000193);
  };
  for (const value of [
    layout.zoneIds.length,
    layout.playerIds.length,
    layout.tokenLayout.scalarPropIds.length,
    layout.varLayout.globalVariableIds.length,
    layout.varLayout.perPlayerVariableIds.length,
    layout.varLayout.zoneVariableIds.length,
    layout.bitsetLayout.globalMarkerWordCount,
  ]) {
    mix(value);
  }
  for (const zoneId of layout.zoneIds) {
    const zone = def.zones.find((entry) => String(entry.id) === String(zoneId));
    mix((zone?.zoneKind ?? 'board') === 'aux' ? 2 : 1);
  }
  return hash >>> 1;
};

const stableStringCode = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 1;
};

const zoneKindCode = (def: GameDef, zoneId: string): number => {
  const zone = def.zones.find((entry) => String(entry.id) === zoneId);
  return (zone?.zoneKind ?? 'board') === 'aux' ? 2 : 1;
};

const encodePolicyBytecodeInput = (
  bytecode: PolicyBytecode,
  encoded: EncodedState,
  context: PolicyWasmBytecodeContext,
): Uint8Array => {
  const layoutId = layoutIdentity(context.layout, context.def);
  const expectedLayoutId = context.expectedLayoutId ?? layoutId;
  const words: number[] = [
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
  ];
  if (words.length !== POLICY_BYTECODE_HEADER_WORDS) {
    throw new Error('Policy WASM bytecode header size drifted.');
  }

  writeI32Array(words, bytecode.instructions);
  writeI32Array(words, bytecode.constants);
  for (const ref of bytecode.featureTable.refs) {
    const kindCode = FEATURE_KIND_CODE[ref.kind];
    if (kindCode === undefined) {
      words.push(-1, ref.layoutIndex, ...Array.from({ length: FEATURE_REF_WORDS - 2 }, () => 0));
      continue;
    }
    words.push(kindCode, ref.layoutIndex);
    for (let index = 0; index < FEATURE_REF_WORDS - 2; index += 1) {
      words.push(ref.aux[index] ?? 0);
    }
  }

  writeI32Array(words, context.layout.zoneIds.map((zoneId) => zoneKindCode(context.def, String(zoneId))));
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
  writeBigUint64Array(words, encoded.globalMarkers);

  const bytes = new Uint8Array(words.length * I32_BYTES);
  const view = new DataView(bytes.buffer);
  for (const [index, word] of words.entries()) {
    assertFiniteI32(`bytecode word ${index}`, word);
    view.setInt32(index * I32_BYTES, word, true);
  }
  return bytes;
};

const encodeBatchInput = (
  program: Uint8Array,
  context: PolicyWasmBytecodeContext,
  candidates: readonly PolicyWasmBatchCandidate[],
): Uint8Array => {
  if (program.byteLength % I32_BYTES !== 0) {
    throw new Error('Policy WASM batch program must be i32-aligned.');
  }
  const layoutId = layoutIdentity(context.layout, context.def);
  const expectedLayoutId = context.expectedLayoutId ?? layoutId;
  const headerAndActionWords = 6 + (candidates.length * 2);
  const bytes = new Uint8Array((headerAndActionWords * I32_BYTES) + program.byteLength);
  const view = new DataView(bytes.buffer);
  const words = [
    POLICY_WASM_ABI_MAGIC,
    POLICY_WASM_ABI_VERSION,
    expectedLayoutId,
    layoutId,
    candidates.length,
    program.byteLength / I32_BYTES,
  ];
  for (const candidate of candidates) {
    words.push(stableStringCode(candidate.actionId), stableStringCode(candidate.stableMoveKey));
  }
  for (const [index, word] of words.entries()) {
    assertFiniteI32(`batch word ${index}`, word);
    view.setInt32(index * I32_BYTES, word, true);
  }
  bytes.set(program, headerAndActionWords * I32_BYTES);
  return bytes;
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
      throw new Error(`Policy WASM bytecode evaluation returned unknown value tag ${tag}.`);
  }
};

export const loadPolicyWasmRuntime = async (
  options: PolicyWasmRuntimeOptions = {},
): Promise<PolicyWasmRuntime> => {
  const wasmPath = options.wasmPath ?? defaultPolicyWasmPath();
  const wasmBytes = options.wasmBytes === undefined
    ? await readFile(wasmPath)
    : asBytes(options.wasmBytes);
  const instantiateResult: WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource =
    await WebAssembly.instantiate(wasmBytes, {}) as WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource;
  const instance = instantiateResult instanceof WebAssembly.Instance
    ? instantiateResult
    : instantiateResult.instance;
  const wasm = checkedExports(instance);

  if (wasm.ludoforge_policy_vm_abi_magic() !== POLICY_WASM_ABI_MAGIC) {
    throw new Error('Policy WASM ABI magic mismatch.');
  }
  if (wasm.ludoforge_policy_vm_abi_version() !== POLICY_WASM_ABI_VERSION) {
    throw new Error('Policy WASM ABI version mismatch.');
  }
  if (wasm.ludoforge_policy_vm_smoke_layout_id() !== POLICY_WASM_SMOKE_LAYOUT_ID) {
    throw new Error('Policy WASM smoke layout mismatch.');
  }

  return {
    wasmPath,
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
          throw new Error(`Policy WASM smoke evaluation failed with status ${status}.`);
        }
        return view.getInt32(outPtr, true);
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, SMOKE_INPUT_BYTES);
        wasm.ludoforge_policy_vm_dealloc(outPtr, I32_BYTES);
      }
    },
    evaluatePolicyBytecode: (bytecode, encoded, context): PolicyValue => {
      const input = encodePolicyBytecodeInput(bytecode, encoded, context);
      const inputPtr = wasm.ludoforge_policy_vm_alloc(input.byteLength);
      const outTagPtr = wasm.ludoforge_policy_vm_alloc(I32_BYTES);
      const outValuePtr = wasm.ludoforge_policy_vm_alloc(I32_BYTES);
      try {
        new Uint8Array(wasm.memory.buffer, inputPtr, input.byteLength).set(input);
        const status = wasm.ludoforge_policy_vm_evaluate_bytecode(
          inputPtr,
          input.byteLength,
          outTagPtr,
          outValuePtr,
        );
        if (status !== 0) {
          throw new Error(`Policy WASM bytecode evaluation failed with status ${status}.`);
        }
        const view = new DataView(wasm.memory.buffer);
        return decodePolicyValue(view.getInt32(outTagPtr, true), view.getInt32(outValuePtr, true));
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
        wasm.ludoforge_policy_vm_dealloc(outTagPtr, I32_BYTES);
        wasm.ludoforge_policy_vm_dealloc(outValuePtr, I32_BYTES);
      }
    },
    evaluatePolicyBytecodeBatch: (bytecode, encoded, context, candidates): readonly PolicyValue[] => {
      const program = encodePolicyBytecodeInput(bytecode, encoded, context);
      const input = encodeBatchInput(program, context, candidates);
      const outputBytes = candidates.length * I32_BYTES;
      const inputPtr = wasm.ludoforge_policy_vm_alloc(input.byteLength);
      const outTagsPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      const outValuesPtr = wasm.ludoforge_policy_vm_alloc(outputBytes);
      try {
        new Uint8Array(wasm.memory.buffer, inputPtr, input.byteLength).set(input);
        const status = wasm.ludoforge_policy_vm_evaluate_bytecode_batch(
          inputPtr,
          input.byteLength,
          outTagsPtr,
          outValuesPtr,
          candidates.length,
        );
        if (status !== 0) {
          throw new Error(`Policy WASM bytecode batch evaluation failed with status ${status}.`);
        }
        const view = new DataView(wasm.memory.buffer);
        return candidates.map((_candidate, index) => decodePolicyValue(
          view.getInt32(outTagsPtr + (index * I32_BYTES), true),
          view.getInt32(outValuesPtr + (index * I32_BYTES), true),
        ));
      } finally {
        wasm.ludoforge_policy_vm_dealloc(inputPtr, input.byteLength);
        wasm.ludoforge_policy_vm_dealloc(outTagsPtr, outputBytes);
        wasm.ludoforge_policy_vm_dealloc(outValuesPtr, outputBytes);
      }
    },
  };
};
