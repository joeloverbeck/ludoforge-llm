// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  POLICY_WASM_SMOKE_LAYOUT_ID,
  loadPolicyWasmRuntime,
} from '../../../src/agents/policy-wasm-runtime.js';

describe('policy WASM runtime bridge', () => {
  it('loads the built WASM artifact and executes the deterministic smoke ABI', async () => {
    const runtime = await loadPolicyWasmRuntime();

    assert.equal(runtime.evaluateSmokeAdd(19, 23), 42);
    assert.equal(runtime.evaluateSmokeAdd(-9, 4), -5);
  });

  it('rejects mismatched layout identity instead of interpreting the buffer', async () => {
    const runtime = await loadPolicyWasmRuntime();

    assert.throws(
      () => runtime.evaluateSmokeAdd(1, 2, POLICY_WASM_SMOKE_LAYOUT_ID + 1),
      /status -4/u,
    );
  });
});
