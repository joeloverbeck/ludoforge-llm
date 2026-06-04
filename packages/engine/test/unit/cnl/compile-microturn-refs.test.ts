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

const previewOptionRefs = [
  ['preview.option.victory.currentMargin.self', { kind: 'previewOptionRef', refKind: 'victoryCurrentMarginSelf' }, [0, 0]],
  ['preview.option.victory.currentRank.self', { kind: 'previewOptionRef', refKind: 'victoryCurrentRankSelf' }, [1, 0]],
  ['preview.option.delta.victory.currentMargin.self', { kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginSelf' }, [2, 0]],
  ['preview.option.victory.currentMargin.role:currentLeader', { kind: 'previewOptionRef', refKind: 'victoryCurrentMarginRole', id: 'currentLeader' }, [3, stableStringCode('currentLeader')]],
  ['preview.option.delta.victory.currentMargin.role:currentLeader', { kind: 'previewOptionRef', refKind: 'deltaVictoryCurrentMarginRole', id: 'currentLeader' }, [4, stableStringCode('currentLeader')]],
  ['preview.option.var.global.score', { kind: 'previewOptionRef', refKind: 'globalVar', id: 'score' }, [5, stableStringCode('score')]],
  ['preview.option.var.player.self.tempo', { kind: 'previewOptionRef', refKind: 'perPlayerVarSelf', id: 'tempo' }, [6, stableStringCode('tempo')]],
  ['preview.option.metric.pressure', { kind: 'previewOptionRef', refKind: 'derivedMetric', id: 'pressure' }, [7, stableStringCode('pressure')]],
  ['preview.option.outcome', { kind: 'previewOptionRef', refKind: 'outcome' }, [8, 0]],
  ['preview.option.driveDepth', { kind: 'previewOptionRef', refKind: 'driveDepth' }, [9, 0]],
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

  it('lowers every preview-option ref kind to the expected feature-table and bytecode shape', () => {
    const layout = buildEncodedStateLayout(def);

    for (const [label, ref, aux] of previewOptionRefs) {
      const bytecode = compilePolicyBytecode(refExpr(ref as CompiledAgentPolicyRef), def, layout);
      const expectedRef: FeatureRef = { kind: 'previewOptionRef', layoutIndex: 0, aux };
      assert.deepEqual(bytecode.featureTable.refs, [expectedRef], label);
      assert.deepEqual(instructions(bytecode), [Opcode.LOAD_FEATURE, 0, Opcode.HALT], label);
    }
  });
});
