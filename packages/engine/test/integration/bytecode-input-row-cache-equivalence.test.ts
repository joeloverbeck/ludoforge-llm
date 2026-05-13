// @test-class: architectural-invariant
//
// Spec 168 Phase 4 bytecode input cache proof. The cache stores encoded WASM
// input bytes only; it must never become a semantic fallback path.

import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { __internal_for_tests as policyWasmRuntimeInternals } from '../../src/agents/policy-wasm-runtime.js';
import { compilePolicyBytecode } from '../../src/cnl/policy-bytecode/index.js';
import {
  buildEncodedState,
  buildEncodedStateLayout,
  createGameDefRuntime,
  forkGameDefRuntimeForRun,
  initialState,
  type CompiledPolicyExpr,
  type GameDef,
} from '../../src/kernel/index.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const SEED = 42;

const selectCanaryExpr = (def: GameDef): CompiledPolicyExpr => {
  const profile = def.agents?.profiles['arvn-evolved'];
  const compiled = def.agents?.compiled;
  assert.ok(profile, 'expected arvn-evolved profile');
  assert.ok(compiled, 'expected compiled policy catalog');

  const stateFeatureId = profile.plan.stateFeatures[0];
  if (stateFeatureId !== undefined) {
    const stateFeature = compiled.stateFeatures[stateFeatureId];
    assert.ok(stateFeature, `expected state feature ${stateFeatureId}`);
    return stateFeature.expr;
  }

  const considerationId = profile.use.considerations[0];
  assert.ok(considerationId, 'expected at least one consideration');
  const consideration = compiled.considerations[considerationId];
  assert.ok(consideration, `expected consideration ${considerationId}`);
  return consideration.value;
};

describe('bytecode input row cache equivalence', () => {
  it('returns byte-identical encoded WASM inputs and records bounded-cache activation', () => {
    const def = getFitlProductionFixture().gameDef;
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, SEED, def.metadata.players.max, undefined, runtime).state;
    const layout = buildEncodedStateLayout(def);
    const encoded = buildEncodedState(state, layout);
    const bytecode = compilePolicyBytecode(selectCanaryExpr(def), def, layout);
    const context = {
      def,
      layout,
      state,
      playerId: Number(state.activePlayer),
    };

    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    const fresh = policyWasmRuntimeInternals.encodePolicyBytecodeInputForTest(bytecode, encoded, context);
    const cachedMiss = policyWasmRuntimeInternals.getEncodedPolicyBytecodeInputForTest(bytecode, encoded, {
      ...context,
      bytecodeInputCache: runtime.policyWasmBytecodeInputCache,
    });
    const cachedHit = policyWasmRuntimeInternals.getEncodedPolicyBytecodeInputForTest(bytecode, encoded, {
      ...context,
      bytecodeInputCache: runtime.policyWasmBytecodeInputCache,
    });

    assert.deepEqual([...cachedMiss], [...fresh], 'first cached encode must equal the canonical fresh encoder bytes');
    assert.deepEqual([...cachedHit], [...fresh], 'cache hit bytes must equal the canonical fresh encoder bytes');
    assert.equal(cachedHit, cachedMiss, 'second lookup must return the cached byte array instance');
    assert.ok(runtime.policyWasmBytecodeInputCache.size <= runtime.policyWasmBytecodeInputCache.evictionLimit);
    assert.deepEqual(policyWasmRuntimeInternals.getPolicyWasmBytecodeInputCacheCounters(), {
      hitCount: 1,
      missCount: 1,
      writeCount: 1,
    });

    policyWasmRuntimeInternals.encodePolicyBytecodeInputForTest(bytecode, encoded, {
      ...context,
      bytecodeStateWordsCache: runtime.policyWasmBytecodeStateWordsCache,
    });
    assert.equal(runtime.policyWasmBytecodeStateWordsCache.size, 1, 'state-words cache should store one canonical state segment');

    policyWasmRuntimeInternals.resetProductionScoreRowCounters();
    const forked = forkGameDefRuntimeForRun(runtime);
    policyWasmRuntimeInternals.getEncodedPolicyBytecodeInputForTest(bytecode, encoded, {
      ...context,
      bytecodeInputCache: forked.policyWasmBytecodeInputCache,
      bytecodeStateWordsCache: forked.policyWasmBytecodeStateWordsCache,
    });

    assert.deepEqual(policyWasmRuntimeInternals.getPolicyWasmBytecodeInputCacheCounters(), {
      hitCount: 0,
      missCount: 1,
      writeCount: 1,
    }, 'forked run-local cache must start empty');
    assert.equal(forked.policyWasmBytecodeStateWordsCache.size, 1, 'forked state-words cache should populate independently');
  });
});
