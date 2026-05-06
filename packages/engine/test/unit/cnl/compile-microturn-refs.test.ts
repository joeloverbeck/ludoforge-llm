// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compilePolicyBytecode,
  Opcode,
  stableStringCode,
  type FeatureRef,
} from '../../../src/cnl/policy-bytecode/index.js';
import {
  asPhaseId,
  assertValidatedGameDef,
  buildEncodedStateLayout,
  type CompiledAgentPolicyRef,
  type CompiledPolicyExpr,
  type GameDef,
} from '../../../src/kernel/index.js';

const def: GameDef = assertValidatedGameDef({
  metadata: { id: 'compile-microturn-refs-test', players: { min: 1, max: 1 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const refExpr = (ref: CompiledAgentPolicyRef): CompiledPolicyExpr => ({ kind: 'ref', ref });

const microturnRefs = [
  ['microturn.kind', { kind: 'microturnIntrinsic', intrinsic: 'kind' }, 0],
  ['microturn.decisionKey', { kind: 'microturnIntrinsic', intrinsic: 'decisionKey' }, 1],
  ['microturn.actorSeat', { kind: 'microturnIntrinsic', intrinsic: 'actorSeat' }, 2],
  ['microturn.remainingRequiredCount', { kind: 'microturnIntrinsic', intrinsic: 'remainingRequiredCount' }, 3],
  ['microturn.remainingMaxCount', { kind: 'microturnIntrinsic', intrinsic: 'remainingMaxCount' }, 4],
  ['microturn.option.value', { kind: 'microturnOptionIntrinsic', intrinsic: 'value' }, 0],
  ['microturn.option.index', { kind: 'microturnOptionIntrinsic', intrinsic: 'index' }, 1],
  ['microturn.option.stableKey', { kind: 'microturnOptionIntrinsic', intrinsic: 'stableKey' }, 2],
  ['microturn.option.tags', { kind: 'microturnOptionIntrinsic', intrinsic: 'tags' }, 3],
  ['microturn.option.targetKind', { kind: 'microturnOptionIntrinsic', intrinsic: 'targetKind' }, 4],
] as const;

const instructions = (bytecode: { readonly instructions: Int32Array }): readonly number[] =>
  Array.from(bytecode.instructions);

describe('microturn policy refs bytecode shape', () => {
  it('lowers every microturn ref kind to the expected feature-table and bytecode shape', () => {
    const layout = buildEncodedStateLayout(def);

    for (const [label, ref, aux] of microturnRefs) {
      const bytecode = compilePolicyBytecode(refExpr(ref), def, layout);
      const expectedRef: FeatureRef = { kind: ref.kind, layoutIndex: 0, aux: [aux] };
      assert.deepEqual(bytecode.featureTable.refs, [expectedRef], label);
      assert.deepEqual(instructions(bytecode), [Opcode.LOAD_FEATURE, 0, Opcode.HALT], label);
    }
  });

  it('uses stable fallback encoding for unknown future microturn intrinsic strings', () => {
    const layout = buildEncodedStateLayout(def);
    const ref = {
      kind: 'microturnIntrinsic',
      intrinsic: 'futureIntrinsic',
    } as unknown as CompiledAgentPolicyRef;

    const bytecode = compilePolicyBytecode(refExpr(ref), def, layout);

    assert.deepEqual(bytecode.featureTable.refs, [{
      kind: 'microturnIntrinsic',
      layoutIndex: 0,
      aux: [stableStringCode('futureIntrinsic')],
    }]);
    assert.deepEqual(instructions(bytecode), [Opcode.LOAD_FEATURE, 0, Opcode.HALT]);
  });
});
