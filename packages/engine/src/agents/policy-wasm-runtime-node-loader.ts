import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  __internal_for_tests as policyWasmRuntimeInternals,
  createPolicyWasmRuntime,
  type PolicyWasmRuntime,
  type PolicyWasmRuntimeOptions,
} from './policy-wasm-runtime.js';

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

export const initializePolicyWasmRuntimeSync = (
  options: PolicyWasmRuntimeOptions = {},
): PolicyWasmRuntime => {
  const wasmPath = options.wasmPath ?? defaultPolicyWasmPath();
  const wasmBytes = options.wasmBytes === undefined
    ? readFileSync(wasmPath)
    : asBytes(options.wasmBytes);
  const moduleBytes = new ArrayBuffer(wasmBytes.byteLength);
  new Uint8Array(moduleBytes).set(wasmBytes);
  const module = new WebAssembly.Module(moduleBytes);
  const instance = new WebAssembly.Instance(module, {});
  const runtime = createPolicyWasmRuntime(instance, wasmPath);
  policyWasmRuntimeInternals.setInitializedPolicyWasmRuntime(runtime);
  return runtime;
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
  return createPolicyWasmRuntime(instance, wasmPath);
};
