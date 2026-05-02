import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY_WASM_ABI_MAGIC = 0x4c46_5750;
export const POLICY_WASM_ABI_VERSION = 1;
export const POLICY_WASM_SMOKE_LAYOUT_ID = 0x1500_0001;
export const POLICY_WASM_SMOKE_OPCODE_ADD = 1;

const SMOKE_INPUT_BYTES = 24;
const I32_BYTES = 4;

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
}

export interface PolicyWasmRuntimeOptions {
  readonly wasmPath?: string;
  readonly wasmBytes?: Uint8Array | ArrayBuffer;
}

export interface PolicyWasmRuntime {
  readonly wasmPath?: string;
  evaluateSmokeAdd(left: number, right: number, layoutId?: number): number;
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
  ] as const) {
    if (typeof exports[name] !== 'function') {
      throw new Error(`Policy WASM module is missing export ${name}.`);
    }
  }
  return exports as PolicyWasmExports;
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
  };
};
